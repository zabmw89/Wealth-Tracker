/**
 * @file prisma/seed.ts
 * @description Deterministic database seeder for the Talent Syria Assessment demo dataset.
 *
 * What this script creates:
 * 1. Three demo users with distinct RBAC roles:
 *    - alice@demo.test → OWNER  (full read/write, member management)
 *    - bob@demo.test   → EDITOR (read/write transactions; cannot manage members)
 *    - carol@demo.test → VIEWER (read-only; cannot create any transactions)
 *
 * 2. One shared "Household" portfolio with all three members.
 *
 * 3. Four assets spanning every supported asset class:
 *    - AAPL  (STOCK)       — publicly traded equity
 *    - BTC   (CRYPTO)      — cryptocurrency
 *    - HOME  (REAL_ESTATE) — illiquid property, no live price feed
 *    - USD   (CASH)        — liquid cash reserve, always valued 1:1
 *
 * 4. A representative transaction ledger:
 *    - DEPOSIT $25,000 cash on 2025-01-02
 *    - BUY  40 AAPL @ $172.50  on 2025-02-10
 *    - SELL 10 AAPL @ $205.00  on 2025-09-01  (realises partial gain, reduces average cost)
 *    - BUY  0.5 BTC @ $62,000  on 2025-03-15
 *    - BUY  1 HOME @ $210,000  on 2024-06-01  (appraisal / purchase entry)
 *
 * 5. Initial market price snapshots for AAPL and BTC so valuations are non-zero on first load.
 *
 * Run via: npm run seed
 * Note: The script wipes all existing rows before re-seeding, ensuring a clean predictable state.
 */

import { prismaAdmin as db } from '../lib/db';

async function main() {
  // ── Wipe existing demo data in reverse-dependency order to avoid FK constraint errors ──
  await db.auditLog.deleteMany();
  await db.transaction.deleteMany();
  await db.asset.deleteMany();
  await db.membership.deleteMany();
  await db.portfolio.deleteMany();
  await db.priceSnapshot.deleteMany();
  await db.user.deleteMany();

  // ── Create the three demo personas ──
  const [alice, bob, carol] = await Promise.all(
    [['alice', 'Alice (Owner)'], ['bob', 'Bob (Editor)'], ['carol', 'Carol (Viewer)']].map(([k, name]) =>
      db.user.create({ data: { email: `${k}@demo.test`, name } })),
  );

  // ── Create the portfolio and assign roles in one atomic write ──
  const p = await db.portfolio.create({
    data: { name: 'Household', memberships: { create: [
      { userId: alice.id, role: 'OWNER' },
      { userId: bob.id, role: 'EDITOR' },
      { userId: carol.id, role: 'VIEWER' },
    ] } },
  });

  // Helper: create an asset belonging to this portfolio
  const mk = (type: any, symbol: string, name: string) =>
    db.asset.create({ data: { portfolioId: p.id, type, symbol, name } });

  // ── Create one asset per supported asset class ──
  const [aapl, btc, home, usd] = await Promise.all([
    mk('STOCK',       'AAPL', 'Apple Inc.'),
    mk('CRYPTO',      'BTC',  'Bitcoin'),
    mk('REAL_ESTATE', 'HOME', 'Family apartment'),
    mk('CASH',        'USD',  'Cash (USD)'),
  ]);

  // Helper: append a transaction entry; all transactions are created by Alice (owner)
  const tx = (assetId: string, type: any, quantity: string, price: string, date: string) =>
    db.transaction.create({ data: { assetId, type, quantity, price, date: new Date(date), createdBy: alice.id } });

  // ── Populate append-only ledger with a realistic sequence of trades ──
  await tx(usd.id,  'DEPOSIT', '25000',    '1',      '2025-01-02'); // Initial cash reserve
  await tx(aapl.id, 'BUY',     '40',       '172.50', '2025-02-10'); // Purchase 40 AAPL
  await tx(aapl.id, 'SELL',    '10',       '205.00', '2025-09-01'); // Partial exit — reduces average cost basis
  await tx(btc.id,  'BUY',     '0.5',      '62000',  '2025-03-15'); // Half a Bitcoin purchase
  await tx(home.id, 'BUY',     '1',        '210000', '2024-06-01'); // Real estate acquisition / appraisal

  // ── Seed initial market price snapshots so holdings show non-zero valuations immediately ──
  const now = new Date();
  await db.priceSnapshot.createMany({ data: [
    { symbol: 'AAPL', price: '231.40', asOf: now },
    { symbol: 'BTC',  price: '98500',  asOf: now },
  ] });

  console.log('Seeded. Log in via /api/dev-login?email=alice@demo.test (or bob / carol).');
}

main().finally(() => db.$disconnect());

