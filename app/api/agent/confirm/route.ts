/**
 * @file app/api/agent/confirm/route.ts
 * @description API Route to confirm and execute pending AI transaction proposals.
 *
 * Architectural Invariant (Agentic Write Safety):
 * - The AI assistant is NEVER permitted to commit database writes directly.
 * - The assistant only prepares structured proposal objects with status 'needs_confirmation'.
 * - This endpoint is invoked strictly upon an explicit user interaction (clicking "Confirm Transaction" in the UI).
 * - The server re-authenticates the session, validates inputs against a strict Zod schema,
 *   and enforces role-based access control (RBAC) through ZenStack's policy-enforced client (`dbFor(user.id)`).
 * - An append-only record is committed to Transaction, and an event is logged in AuditLog with source='AGENT'.
 */

import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { dbFor } from '@/lib/db';

// Validation pattern: Decimal-safe numeric string representation
const dec = z.string().regex(/^\d+(\.\d+)?$/, 'Must be a valid decimal string');

// Request body schema for confirming a transaction proposal
const Body = z.object({
  portfolioId: z.string().min(1, 'Portfolio ID is required'),
  assetId: z.string().min(1, 'Asset ID is required'),
  type: z.enum(['BUY', 'SELL', 'DEPOSIT', 'WITHDRAW']),
  quantity: dec,
  price: dec,
  fee: dec.default('0'),
  date: z.string().datetime(),
});

/**
 * POST /api/agent/confirm
 * Commits a validated AI transaction proposal after explicit user confirmation.
 */
export async function POST(req: Request) {
  // 1. Identify user from verified session/cookie
  const user = await getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Validate request body with Zod
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { portfolioId, ...b } = parsed.data;

  // 3. Obtain policy-enforced database client for this user
  const db = dbFor(user.id);

  // 4. Verify the asset exists and is accessible in this portfolio
  const asset = await db.asset.findFirst({
    where: { id: b.assetId, portfolioId },
  });
  if (!asset) {
    return Response.json({ error: 'Asset not found or access denied' }, { status: 404 });
  }

  try {
    // 5. Commit transaction to append-only ledger
    // Policy rule: Only OWNER or EDITOR can insert transactions; createdBy must match authenticated user
    const tx = await db.transaction.create({
      data: {
        ...b,
        date: new Date(b.date),
        createdBy: user.id,
      },
    });

    // 6. Record immutable audit log entry
    await db.auditLog.create({
      data: {
        userId: user.id,
        portfolioId,
        source: 'AGENT',
        action: 'transaction.create',
        payload: b,
      },
    });

    return Response.json(tx);
  } catch {
    // Fails closed: If user is a VIEWER or lacks write permissions, ZenStack throws a policy error
    return Response.json({ error: 'Not permitted: Insufficient role permissions' }, { status: 403 });
  }
}
