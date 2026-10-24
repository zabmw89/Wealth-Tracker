/**
 * @file lib/portfolio.ts
 * @description Domain service for portfolio initialization and lifecycle management.
 *
 * Architectural Note on Privileged Writes:
 * Creating a portfolio and its initial OWNER membership is the single intentional privileged write
 * in the system. Because no portfolio or owner exists prior to this execution, normal policy evaluation
 * cannot authorize the first membership create. Therefore, this operation explicitly utilizes an atomic
 * database transaction on `prismaAdmin` and immediately records an entry in `AuditLog`.
 */

import { prismaAdmin } from './db';

/**
 * Creates a new portfolio, assigns the creator as OWNER, and logs an audit record atomically.
 *
 * @param {string} userId - The user ID who will be assigned the OWNER role.
 * @param {string} name - The display name of the portfolio (e.g., 'Household Wealth').
 * @param {string} [baseCurrency='USD'] - The portfolio's functional currency.
 * @returns {Promise<Portfolio>} The created portfolio record.
 */
export async function createPortfolio(userId: string, name: string, baseCurrency = 'USD') {
  return prismaAdmin.$transaction(async (tx) => {
    // 1. Create the portfolio along with its initial OWNER membership
    const p = await tx.portfolio.create({
      data: {
        name,
        baseCurrency,
        memberships: {
          create: { userId, role: 'OWNER' },
        },
      },
    });

    // 2. Commit audit log entry documenting portfolio initialization
    await tx.auditLog.create({
      data: {
        userId,
        portfolioId: p.id,
        source: 'UI',
        action: 'portfolio.create',
        payload: { name, baseCurrency },
      },
    });

    return p;
  });
}
