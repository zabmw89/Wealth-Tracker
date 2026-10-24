/**
 * @file app/api/prices/refresh/route.ts
 * @description API Route for refreshing market price snapshots with a simulated demo feed.
 *
 * Demo Architecture Notes:
 * - In production this endpoint would call an external market data provider (e.g. Polygon, Yahoo Finance).
 * - For the assessment demo, deterministic-but-slightly-varied prices are generated using Math.random()
 *   within a realistic range, so the dashboard visually reflects live-like price movements.
 * - Each refresh appends a new PriceSnapshot row. The valuation layer always reads the most recent
 *   snapshot, so holdings recompute automatically on the next GET /api/portfolio call.
 *
 * Security:
 * - Requires an active authenticated session (HttpOnly cookie). Unauthenticated callers receive 401.
 * - Uses `prismaAdmin` intentionally: updating global price data is a privileged administrative
 *   operation not scoped to a specific user's portfolio membership.
 */

import { prismaAdmin } from '@/lib/db';
import { getUser } from '@/lib/auth';

/**
 * POST /api/prices/refresh
 * Generates and persists new price snapshots for all actively-tracked symbols.
 */
export async function POST(req: Request) {
  // Verify user is authenticated before allowing any price updates
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Demo Feed: Slightly randomised prices anchored near realistic market values.
  // AAPL: oscillates in the $230–235 range; BTC: oscillates in the $98,000–99,200 range.
  const updates = [
    { symbol: 'AAPL', price: (230 + Math.random() * 5).toFixed(2), asOf: now },
    { symbol: 'BTC', price: (98000 + Math.random() * 1200).toFixed(2), asOf: now },
  ];

  // Append a new snapshot row for each symbol (the valuation layer picks the latest by asOf DESC)
  for (const update of updates) {
    await prismaAdmin.priceSnapshot.create({
      data: update,
    });
  }

  return Response.json({
    success: true,
    message: 'Market price snapshots refreshed successfully (Demo Feed).',
    asOf: now.toISOString(),
    updatedSymbols: updates,
  });
}
