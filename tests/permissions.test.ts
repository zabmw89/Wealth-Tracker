/**
 * @file tests/permissions.test.ts
 * @description Integration tests for RBAC data-layer enforcement, AI agent boundaries, and security invariants.
 *
 * These tests require a running PostgreSQL database with the Prisma schema applied.
 * Run: npm test (after `npm run dev:db` and `npm run seed`)
 *
 * Test Groups:
 * 1. `data layer`      — Verifies ZenStack row-level policies for Viewer/Editor/Owner roles.
 * 2. `agent boundary`  — Confirms the agent tool registry correctly restricts write tools for Viewers
 *                        and rejects foreign asset IDs inside proposals.
 * 3. `security invariants` — Validates cross-household isolation, proposal non-mutation, and
 *                            Viewer inability to bypass policies through direct confirmation calls.
 */

// Requires a running Postgres with the schema pushed (see README). Run: npm test
import { describe, it, expect, beforeAll } from 'vitest';
import { prismaAdmin, dbFor } from '@/lib/db';
import { createAgentTools } from '@/lib/agent/tools';

let ids: Record<string, string> = {}, portfolioId = '', assetId = '', otherAssetId = '';

beforeAll(async () => {
  const u = async (k: string) => (await prismaAdmin.user.upsert({
    where: { email: `${k}@perm.test` }, update: {}, create: { email: `${k}@perm.test`, name: k } })).id;
  ids = {
    owner: await u('owner'),
    editor: await u('editor'),
    viewer: await u('viewer'),
    outsider: await u('outsider'),
    stranger: await u('stranger'),
  };
  const p = await prismaAdmin.portfolio.create({ data: { name: 'T', memberships: { create: [
    { userId: ids.owner, role: 'OWNER' }, { userId: ids.editor, role: 'EDITOR' }, { userId: ids.viewer, role: 'VIEWER' } ] } } });
  portfolioId = p.id;
  assetId = (await prismaAdmin.asset.create({ data: { portfolioId, type: 'STOCK', symbol: 'T1', name: 'T1' } })).id;
  const p2 = await prismaAdmin.portfolio.create({ data: { name: 'Other', memberships: { create: { userId: ids.outsider, role: 'OWNER' } } } });
  otherAssetId = (await prismaAdmin.asset.create({ data: { portfolioId: p2.id, type: 'STOCK', symbol: 'T2', name: 'T2' } })).id;
});

const newTx = (by: string, aid = assetId) => ({
  assetId: aid, type: 'BUY' as const, quantity: '1', price: '10', date: new Date(), createdBy: by });

describe('data layer', () => {
  it('Viewer can read but not write', async () => {
    const db = dbFor(ids.viewer);
    expect(await db.asset.findMany({ where: { portfolioId } })).toHaveLength(1);
    await expect(db.transaction.create({ data: newTx(ids.viewer) })).rejects.toThrow();
  });
  it('Editor can write, but cannot forge authorship or manage members', async () => {
    const db = dbFor(ids.editor);
    await expect(db.transaction.create({ data: newTx(ids.editor) })).resolves.toBeTruthy();
    await expect(db.transaction.create({ data: newTx(ids.owner) })).rejects.toThrow();
    await expect(db.membership.create({ data: { userId: ids.outsider, portfolioId, role: 'VIEWER' } })).rejects.toThrow();
  });
  it('Owner can manage members', async () => {
    await expect(dbFor(ids.owner).membership.create({ data: { userId: ids.outsider, portfolioId, role: 'VIEWER' } })).resolves.toBeTruthy();
  });
  it('transactions are append-only', async () => {
    const t = await prismaAdmin.transaction.findFirstOrThrow({ where: { assetId } });
    await expect(dbFor(ids.owner).transaction.delete({ where: { id: t.id } })).rejects.toThrow();
  });
});

describe('agent boundary', () => {
  const ctx = (uid: string, role: any) => ({ userId: uid, portfolioId, role, db: dbFor(uid) as any });
  it('Viewer gets no write tool', () => {
    expect(Object.keys(createAgentTools(ctx(ids.viewer, 'VIEWER')))).not.toContain('proposeTransaction');
  });
  it('Editor gets the proposal tool, and a foreign asset id is rejected', async () => {
    const tools: any = createAgentTools(ctx(ids.editor, 'EDITOR'));
    const res = await tools.proposeTransaction.execute({ assetId: otherAssetId, type: 'BUY', quantity: '1', price: '1', fee: '0', date: new Date().toISOString() }, {});
    expect(res.status).toBe('rejected');
  });
});

describe('security invariants', () => {
  it('outsider from another household cannot read a portfolio by guessing its ID', async () => {
    const dbStranger = dbFor(ids.stranger);
    // Stranger queries portfolio T (not a member)
    const assets = await dbStranger.asset.findMany({ where: { portfolioId } });
    expect(assets).toHaveLength(0); // fails closed, returns empty set
    const p = await dbStranger.portfolio.findFirst({ where: { id: portfolioId } });
    expect(p).toBeNull();
  });

  it('preparing an AI transaction proposal does NOT mutate the database', async () => {
    const initialCount = await prismaAdmin.transaction.count({ where: { assetId } });
    const tools: any = createAgentTools({ userId: ids.editor, portfolioId, role: 'EDITOR', db: dbFor(ids.editor) as any });

    const proposal = await tools.proposeTransaction.execute({
      assetId,
      type: 'BUY',
      quantity: '5',
      price: '150',
      fee: '0',
      date: new Date().toISOString(),
    }, {});

    expect(proposal.status).toBe('needs_confirmation');
    expect(proposal.proposal.assetSymbol).toBe('T1');

    // Invariant: no database records were inserted
    const finalCount = await prismaAdmin.transaction.count({ where: { assetId } });
    expect(finalCount).toBe(initialCount);
  });

  it('Viewer cannot confirm or commit a transaction through the data access layer', async () => {
    const dbViewer = dbFor(ids.viewer);
    await expect(
      dbViewer.transaction.create({
        data: {
          assetId,
          type: 'BUY',
          quantity: '5',
          price: '150',
          fee: '0',
          date: new Date(),
          createdBy: ids.viewer,
        },
      })
    ).rejects.toThrow();
  });
});

