/**
 * @file app/api/portfolio/route.ts
 * @description API Route providing the primary portfolio data payload for the client dashboard.
 *
 * Responsibilities:
 * 1. User Resolution: Authenticates the current user session (defaulting to demo persona Alice for assessment ease).
 * 2. Scoped Membership: Looks up the portfolio membership for this user through `dbFor(user.id)`.
 * 3. Holdings & Allocation Calculation: Derives holdings and asset allocation breakdown using pure domain services.
 * 4. Recent Transactions: Returns bounded recent transactions from the immutable ledger.
 * 5. Persona Switcher Data: Provides list of demo users (Alice, Bob, Carol) for quick RBAC role switching.
 */

import { getUser } from '@/lib/auth';
import { dbFor, prismaAdmin } from '@/lib/db';
import { computeHoldings, computeAllocation } from '@/lib/valuation';

/**
 * GET /api/portfolio
 * Returns authorized portfolio metrics, holdings projection, and transaction history.
 */
export async function GET() {
  let user = await getUser();

  // If no user cookie is present yet, default to Alice (Owner) for instant demo usability
  if (!user) {
    user = await prismaAdmin.user.findUnique({ where: { email: 'alice@demo.test' } });
  }

  if (!user) {
    return Response.json(
      { error: 'No demo users found. Please run npm run seed first.' },
      { status: 404 }
    );
  }

  // Use policy-enforced database client scoped to this user
  const db = dbFor(user.id);

  // Find portfolio where the authenticated user is an active member
  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    include: { portfolio: true },
  });

  if (!membership) {
    return Response.json(
      { error: 'No accessible portfolio found for this user.' },
      { status: 403 }
    );
  }

  const portfolio = membership.portfolio;

  // Read assets belonging to this portfolio (read policy enforces membership)
  const assets = await db.asset.findMany({
    where: { portfolioId: portfolio.id },
    include: { transactions: true },
  });

  // Calculate holdings using average-cost accounting from append-only transactions
  const holdings = await computeHoldings(db as any, assets);
  const allocation = computeAllocation(holdings);

  // Read recent transactions (bounded to recent 30 items)
  const transactions = await db.transaction.findMany({
    where: { asset: { portfolioId: portfolio.id } },
    include: { asset: true },
    orderBy: { date: 'desc' },
    take: 30,
  });

  // Fetch available demo users for the role switcher component
  const demoUsers = await prismaAdmin.user.findMany({
    where: { email: { in: ['alice@demo.test', 'bob@demo.test', 'carol@demo.test'] } },
    select: { id: true, name: true, email: true },
    orderBy: { email: 'asc' },
  });

  return Response.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      role: membership.role,
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        baseCurrency: portfolio.baseCurrency,
      },
      assets: assets.map((a) => ({ id: a.id, symbol: a.symbol, name: a.name, type: a.type })),
      holdings,
      allocation,
      transactions: transactions.map((t) => ({
        id: t.id,
        assetId: t.assetId,
        assetSymbol: t.asset.symbol,
        assetName: t.asset.name,
        type: t.type,
        quantity: t.quantity.toString(),
        price: t.price.toString(),
        fee: t.fee.toString(),
        date: t.date.toISOString(),
        createdBy: t.createdBy,
        createdAt: t.createdAt.toISOString(),
      })),
      demoUsers,
      asOf: new Date().toISOString(),
    },
    {
      headers: {
        // Automatically attach authentication cookie if defaulted to demo user
        'Set-Cookie': `uid=${user.id}; Path=/; HttpOnly; SameSite=Lax`,
      },
    }
  );
}
