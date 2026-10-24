/**
 * @file lib/agent/tools.ts
 * @description Vercel AI SDK Tool definitions for the Portfolio Assistant.
 *
 * Security Architecture (3 Defense Layers):
 * 1. Scope Closure:
 *    - `userId`, `portfolioId`, and `role` are never accepted as arguments from the AI model.
 *    - They are verified and closed over server-side within `AgentCtx` before tool instantiation.
 * 2. Role-Based Registration:
 *    - Write-like tools (`proposeTransaction`) are completely omitted from the tool dictionary
 *      for users with the `VIEWER` role.
 * 3. Proposal-Only Execution (Agentic Write Safety):
 *    - `proposeTransaction` has ZERO database mutation side-effects. It only creates a verified
 *      pending proposal object for user review and explicit UI confirmation.
 *    - Actual database writes are performed exclusively by the authenticated user calling
 *      `POST /api/agent/confirm` through the ZenStack policy-enforced client.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { PrismaClient, Role } from '@prisma/client';
import { computeHoldings, computeAllocation, computeRebalance } from '@/lib/valuation';

/**
 * Execution context provided to the agent tools on every request.
 */
export type AgentCtx = {
  userId: string;
  portfolioId: string;
  role: Role;
  db: PrismaClient; // ZenStack policy-enforced client where auth() === userId
};

// Zod schema for validated asset identifiers
const assetId = z.string().min(1).describe('Asset id from listHoldings');

/**
 * Factory function creating AI SDK tools bounded by the user's authenticated portfolio and role.
 *
 * @param {AgentCtx} ctx - Context containing verified userId, portfolioId, role, and database client.
 * @returns {Record<string, CoreTool>} Map of available tools for this agent session.
 */
export function createAgentTools(ctx: AgentCtx) {
  const { db, portfolioId } = ctx;

  // =========================================================================
  // READ-ONLY TOOLS (Available to all roles: OWNER, EDITOR, VIEWER)
  // =========================================================================
  const readTools = {
    /**
     * Tool: getPortfolioSummary
     * Retrieves overall portfolio valuation, total cost basis, unrealized PnL, and allocation breakdown.
     */
    getPortfolioSummary: tool({
      description: 'Total value, cost basis, P/L and allocation by asset type.',
      inputSchema: z.object({}),
      execute: async () => {
        const assets = await db.asset.findMany({
          where: { portfolioId },
          include: { transactions: true },
        });
        const holdings = await computeHoldings(db as any, assets);
        return { ...computeAllocation(holdings), asOf: new Date().toISOString() };
      },
    }),

    /**
     * Tool: listHoldings
     * Lists active holdings derived from the ledger, optionally filtered by asset class.
     */
    listHoldings: tool({
      description: 'Current holdings, optionally filtered by asset type.',
      inputSchema: z.object({
        type: z.enum(['STOCK', 'CRYPTO', 'REAL_ESTATE', 'CASH']).optional(),
      }),
      execute: async ({ type }) => {
        const assets = await db.asset.findMany({
          where: { portfolioId, ...(type && { type }) },
          include: { transactions: true },
        });
        return computeHoldings(db as any, assets);
      },
    }),

    /**
     * Tool: getTransactions
     * Queries recent ledger transactions ordered by date descending.
     */
    getTransactions: tool({
      description: 'Recent transactions, newest first.',
      inputSchema: z.object({
        assetId: assetId.optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ assetId, limit }) =>
        // Scoped strictly by portfolio and checked by ZenStack policies
        db.transaction.findMany({
          where: { asset: { portfolioId }, ...(assetId && { assetId }) },
          orderBy: { date: 'desc' },
          take: limit,
        }),
    }),

    /**
     * Tool: suggestRebalance
     * Calculates deterministic trade recommendations to match target allocation percentages.
     */
    suggestRebalance: tool({
      description:
        'Deterministic rebalancing suggestion against target allocation. ' +
        'Explain the result; do not recompute it yourself.',
      inputSchema: z.object({
        targets: z
          .record(z.enum(['STOCK', 'CRYPTO', 'REAL_ESTATE', 'CASH']), z.number().min(0).max(100))
          .refine((t) => Math.abs(Object.values(t).reduce((a, b) => a + b, 0) - 100) < 0.01, {
            message: 'Targets must sum to 100%',
          }),
      }),
      execute: async ({ targets }) => {
        const assets = await db.asset.findMany({
          where: { portfolioId },
          include: { transactions: true },
        });
        return computeRebalance(await computeHoldings(db as any, assets), targets);
      },
    }),
  };

  // =========================================================================
  // WRITE-LIKE PROPOSAL TOOL (Registered ONLY for OWNER and EDITOR)
  // =========================================================================
  const proposeTransaction = tool({
    description:
      'Propose logging a transaction. Does NOT save anything: the user must confirm in the UI.',
    inputSchema: z.object({
      assetId,
      type: z.enum(['BUY', 'SELL', 'DEPOSIT', 'WITHDRAW']),
      quantity: z.string().regex(/^\d+(\.\d+)?$/), // String representations to prevent floating point drift
      price: z.string().regex(/^\d+(\.\d+)?$/),
      fee: z.string().regex(/^\d+(\.\d+)?$/).default('0'),
      date: z.string().datetime(),
    }),
    execute: async (input) => {
      // Validate that the target asset exists and belongs to this portfolio
      const asset = await db.asset.findFirst({ where: { id: input.assetId, portfolioId } });
      if (!asset) {
        return { status: 'rejected', reason: 'Asset not found in this portfolio.' };
      }

      // Return structured proposal for UI card confirmation (NO database write occurs here)
      return {
        status: 'needs_confirmation',
        proposal: { ...input, assetSymbol: asset.symbol },
      };
    },
  });

  // Layer 1 RBAC check: Viewers receive read tools only
  const canWrite = ctx.role === 'OWNER' || ctx.role === 'EDITOR';
  return canWrite ? { ...readTools, proposeTransaction } : readTools;
}
