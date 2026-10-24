/**
 * @file lib/valuation.ts
 * @description Domain valuation services providing financial mathematics and accounting logic.
 *
 * Accounting Model:
 * 1. Average-Cost Accounting:
 *    - Holdings are NEVER stored as independently updated mutable state; they are pure
 *      projections derived deterministically from the append-only transaction ledger.
 *    - On BUY or DEPOSIT: `quantity += q`, `costBasis += (q * price) + fee`.
 *    - On SELL: cost basis is reduced proportionally by `(costBasis / quantity) * q`, preserving average cost.
 *
 * 2. Exact Decimal Precision:
 *    - All monetary and quantity calculations use Decimal.js (`Decimal(28, 10)` in database).
 *    - Zero IEEE 754 binary floating-point drift.
 *
 * 3. Asset Class Rules:
 *    - CASH is permanently valued at 1:1 against the base currency.
 *    - REAL_ESTATE falls back to the most recent transaction/appraisal valuation.
 *    - STOCKS & CRYPTO resolve to the latest available PriceSnapshot record.
 */

import Decimal from 'decimal.js';

export type AssetType = 'STOCK' | 'CRYPTO' | 'REAL_ESTATE' | 'CASH';

export type Tx = {
  type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
  quantity: unknown;
  price: unknown;
  fee: unknown;
  date: Date;
};

export type AssetWithTx = {
  id: string;
  type: AssetType;
  symbol: string;
  name: string;
  transactions: Tx[];
};

export type Holding = {
  assetId: string;
  symbol: string;
  name: string;
  type: AssetType;
  quantity: string;
  costBasis: string;
  price: string;
  value: string;
};

// Helper: Wrap values into Decimal instances safely
const D = (x: unknown) => new Decimal(String(x));

/**
 * Pure function: Derives a holding projection from an asset's transaction history using average cost.
 *
 * @param {AssetWithTx} asset - The asset entity with its associated transaction entries.
 * @param {Decimal | null} marketPrice - The latest market price snapshot, or null if unavailable.
 * @returns {Holding} The computed holding with quantity, cost basis, price, and current market value.
 */
export function deriveHolding(asset: AssetWithTx, marketPrice: Decimal | null): Holding {
  let qty = D(0), cost = D(0), last = D(0);

  // Chronologically sort transactions to calculate running average cost accurately
  const txs = [...asset.transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const t of txs) {
    const q = D(t.quantity), p = D(t.price), f = D(t.fee);
    last = p;

    if (t.type === 'BUY' || t.type === 'DEPOSIT') {
      // Add incoming quantity and invested capital (including transaction fee)
      qty = qty.plus(q);
      cost = cost.plus(q.times(p)).plus(f);
    } else {
      // Realize disposal: reduce cost basis proportionally to average unit cost
      const avg = qty.isZero() ? D(0) : cost.div(qty);
      cost = cost.minus(avg.times(q));
      qty = qty.minus(q);
    }
  }

  // Price determination: Cash is always 1:1; real estate falls back to last recorded transaction price
  const price = asset.type === 'CASH' ? D(1) : marketPrice ?? last;

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    type: asset.type,
    quantity: qty.toString(),
    costBasis: cost.toString(),
    price: price.toString(),
    value: qty.times(price).toString(),
  };
}

type PriceDb = {
  priceSnapshot: {
    findMany: (args: any) => Promise<{ symbol: string; price: unknown }[]>;
  };
};

/**
 * Computes holding projections for a set of assets by querying the latest market price snapshots.
 *
 * @param {PriceDb} db - Database client supporting priceSnapshot queries.
 * @param {AssetWithTx[]} assets - List of assets containing transaction ledgers.
 * @returns {Promise<Holding[]>} The list of calculated holdings.
 */
export async function computeHoldings(db: PriceDb, assets: AssetWithTx[]): Promise<Holding[]> {
  const symbols = assets
    .filter((a) => a.type === 'STOCK' || a.type === 'CRYPTO')
    .map((a) => a.symbol);

  // Retrieve snapshots sorted by asOf descending to pick the latest price per symbol
  const snaps = await db.priceSnapshot.findMany({
    where: { symbol: { in: symbols } },
    orderBy: { asOf: 'desc' },
  });

  const latest = new Map<string, Decimal>();
  for (const s of snaps) {
    if (!latest.has(s.symbol)) {
      latest.set(s.symbol, D(s.price));
    }
  }

  return assets.map((a) => deriveHolding(a, latest.get(a.symbol) ?? null));
}

/**
 * Computes portfolio-wide aggregates and asset allocation percentages by class.
 *
 * @param {Holding[]} holdings - List of active holdings.
 * @returns Portfolio totals including totalValue, totalCost, unrealized pnl, and byType breakdown.
 */
export function computeAllocation(holdings: Holding[]) {
  const total = holdings.reduce((s, h) => s.plus(h.value), D(0));
  const cost = holdings.reduce((s, h) => s.plus(h.costBasis), D(0));
  const byType: Record<string, { value: string; pct: string }> = {};

  for (const h of holdings) {
    const prev = D(byType[h.type]?.value ?? 0).plus(h.value);
    byType[h.type] = {
      value: prev.toString(),
      pct: total.isZero() ? '0' : prev.div(total).times(100).toFixed(2),
    };
  }

  return {
    totalValue: total.toString(),
    totalCost: cost.toString(),
    pnl: total.minus(cost).toString(),
    byType,
  };
}

/**
 * Computes deterministic rebalancing recommendations given target allocation percentages.
 *
 * @param {Holding[]} holdings - List of active holdings.
 * @param {Partial<Record<AssetType, number>>} targets - Target allocation weights summing to 100%.
 * @returns List of recommended trades (BUY or SELL) with monetary delta amounts.
 */
export function computeRebalance(holdings: Holding[], targets: Partial<Record<AssetType, number>>) {
  const { totalValue, byType } = computeAllocation(holdings);
  const total = D(totalValue);

  return (Object.keys(targets) as AssetType[]).map((type) => {
    const current = D(byType[type]?.value ?? 0);
    const targetAmount = total.times(targets[type]!).div(100);
    const delta = targetAmount.minus(current);

    return {
      type,
      action: delta.gte(0) ? ('BUY' as const) : ('SELL' as const),
      amount: delta.abs().toFixed(2),
    };
  });
}
