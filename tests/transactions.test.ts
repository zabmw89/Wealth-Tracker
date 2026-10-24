/**
 * @file tests/transactions.test.ts
 * @description Integration tests for transaction creation and immutable ledger enforcement.
 *
 * These tests require a running PostgreSQL database with the Prisma schema applied.
 * Run: npm test (after `npm run dev:db` and `npm run seed`)
 *
 * Test Coverage:
 * 1. Average-cost holding projection: verifies that two sequential BUY transactions produce
 *    correct cumulative quantity, cost basis, and market value via `deriveHolding`.
 * 2. Append-only immutability: confirms that UPDATE and DELETE operations on transactions
 *    are unconditionally rejected by the ZenStack access policy (even for the record creator).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { prismaAdmin, dbFor } from '@/lib/db';
import { deriveHolding } from '@/lib/valuation';
import Decimal from 'decimal.js';

// ── Shared test state ─────────────────────────────────────────────────────────
let userId = '', portfolioId = '', assetId = '';

beforeAll(async () => {
  // Create an isolated test user, portfolio, and asset to avoid polluting the demo seed data
  const user = await prismaAdmin.user.upsert({
    where: { email: 'tx-tester@test.com' },
    update: {},
    create: { email: 'tx-tester@test.com', name: 'Tx Tester' },
  });
  userId = user.id;

  // Assign EDITOR role so the user can create transactions (but not manage members)
  const p = await prismaAdmin.portfolio.create({
    data: {
      name: 'Tx Portfolio',
      memberships: { create: { userId, role: 'EDITOR' } },
    },
  });
  portfolioId = p.id;

  const asset = await prismaAdmin.asset.create({
    data: {
      portfolioId,
      type: 'STOCK',
      symbol: 'TEST',
      name: 'Test Stock',
    },
  });
  assetId = asset.id;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transactions and holding projections', () => {
  it('creates a transaction and projects the holding with accurate average cost', async () => {
    const db = dbFor(userId);

    // 1. First BUY: 10 @ $100 with $5 fee → cost basis += (10 * 100) + 5 = 1,005
    await db.transaction.create({
      data: {
        assetId,
        type: 'BUY',
        quantity: '10',
        price: '100',
        fee: '5',
        date: new Date('2025-01-01'),
        createdBy: userId,
      },
    });

    // 2. Second BUY: 10 @ $200 with $5 fee → cost basis += (10 * 200) + 5 = 2,005
    await db.transaction.create({
      data: {
        assetId,
        type: 'BUY',
        quantity: '10',
        price: '200',
        fee: '5',
        date: new Date('2025-02-01'),
        createdBy: userId,
      },
    });

    // Fetch the asset with its embedded transactions from the database
    const assetWithTxs = await db.asset.findUniqueOrThrow({
      where: { id: assetId },
      include: { transactions: true },
    });

    // Derive the holding using the average-cost accounting formula
    const holding = deriveHolding(assetWithTxs as any, new Decimal('250'));

    expect(holding.quantity).toBe('20');
    // Total cost = (10*100 + 5) + (10*200 + 5) = 1005 + 2005 = 3010
    expect(holding.costBasis).toBe('3010');
    // Value = 20 * 250 = 5000
    expect(holding.value).toBe('5000');
  });

  it('rejects update and delete operations on transactions (immutable append-only)', async () => {
    const db = dbFor(userId);
    // Use the admin client to find any existing transaction on this asset
    const tx = await prismaAdmin.transaction.findFirstOrThrow({ where: { assetId } });

    // Update is not allowed by ZenStack policy (fails closed)
    // Policy rule: @@deny('update', true) — no exceptions
    await expect(
      (db.transaction as any).update({
        where: { id: tx.id },
        data: { quantity: '999' },
      })
    ).rejects.toThrow();

    // Delete is not allowed by ZenStack policy (fails closed)
    // Policy rule: @@deny('delete', true) — no exceptions
    await expect(
      db.transaction.delete({
        where: { id: tx.id },
      })
    ).rejects.toThrow();
  });
});

