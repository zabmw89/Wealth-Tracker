/**
 * @file tests/valuation.test.ts
 * @description Unit tests for the pure valuation domain services (lib/valuation.ts).
 *
 * These tests run in-process with Vitest and require NO database connection — all inputs
 * are pure TypeScript objects, making them fast and fully deterministic.
 *
 * Test Coverage:
 * - `deriveHolding`: average-cost accounting, floating-point precision, and CASH special-case.
 * - `computeAllocation`: percentage breakdown and unrealized PnL calculation.
 * - `computeRebalance`: target-based BUY / SELL trade recommendations.
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { deriveHolding, computeAllocation, computeRebalance } from '@/lib/valuation';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts a date string to a Date object — used to keep transaction fixtures readable. */
const d = (s: string) => new Date(s);

/**
 * Factory that creates a minimal STOCK asset fixture with the given transaction list.
 * The id / symbol / name are fixed to keep test fixtures concise.
 */
const stock = (txs: any[]) => ({ id: 'a', type: 'STOCK' as const, symbol: 'X', name: 'X', transactions: txs });

// ── deriveHolding ─────────────────────────────────────────────────────────────

describe('deriveHolding', () => {
  it('uses average cost and reduces basis on sell', () => {
    // Scenario: Buy 10 @ $100, then 10 @ $200 (avg cost = $150), then sell 10.
    // After sell: 10 units remain; cost basis = 10 * $150 avg = $1,500.
    const h = deriveHolding(stock([
      { type: 'BUY',  quantity: '10', price: '100', fee: '0', date: d('2025-01-01') },
      { type: 'BUY',  quantity: '10', price: '200', fee: '0', date: d('2025-02-01') },
      { type: 'SELL', quantity: '10', price: '300', fee: '0', date: d('2025-03-01') },
    ]), new Decimal(250));

    expect(h.quantity).toBe('10');
    expect(h.costBasis).toBe('1500'); // avg 150 * 10
    expect(h.value).toBe('2500');     // 10 units * $250 market price
  });

  it('has no floating point drift', () => {
    // Validates that Decimal.js prevents IEEE 754 rounding errors.
    // 0.1 * 0.2 = 0.02000000000000000004 in native JS floats; must be exact 0.02 here.
    const h = deriveHolding(stock([{ type: 'BUY', quantity: '0.1', price: '0.2', fee: '0', date: d('2025-01-01') }]), null);
    expect(h.costBasis).toBe('0.02');
  });

  it('values cash 1:1', () => {
    // CASH assets always receive a price of $1 regardless of any market snapshot.
    const h = deriveHolding({ id: 'c', type: 'CASH', symbol: 'USD', name: 'Cash',
      transactions: [{ type: 'DEPOSIT', quantity: '500', price: '1', fee: '0', date: d('2025-01-01') }] }, null);
    expect(h.value).toBe('500');
  });
});

// ── computeAllocation & computeRebalance ──────────────────────────────────────

describe('allocation and rebalance', () => {
  // Shared fixture: $700 in STOCK and $300 in CASH = $1,000 total portfolio value.
  const holdings = [
    { assetId: '1', symbol: 'A', name: 'A', type: 'STOCK' as const, quantity: '1', costBasis: '600', price: '700', value: '700' },
    { assetId: '2', symbol: 'U', name: 'U', type: 'CASH'  as const, quantity: '300', costBasis: '300', price: '1',   value: '300' },
  ];

  it('computes percentages and pnl', () => {
    const a = computeAllocation(holdings);
    // Total value: $700 + $300 = $1,000; total cost: $600 + $300 = $900; PnL = $100
    expect(a.totalValue).toBe('1000');
    expect(a.pnl).toBe('100');
    // STOCK allocation: $700 / $1,000 = 70%
    expect(a.byType.STOCK.pct).toBe('70.00');
  });

  it('suggests trades toward targets', () => {
    // Target: 50% STOCK ($500) and 50% CASH ($500).
    // Current: STOCK $700 → SELL $200; CASH $300 → BUY $200.
    expect(computeRebalance(holdings, { STOCK: 50, CASH: 50 })).toEqual([
      { type: 'STOCK', action: 'SELL', amount: '200.00' },
      { type: 'CASH',  action: 'BUY',  amount: '200.00' },
    ]);
  });
});

