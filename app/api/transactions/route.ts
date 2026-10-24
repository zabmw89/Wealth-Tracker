/**
 * @file app/api/transactions/route.ts
 * @description Direct transaction creation route (Workflow B: "Record a transaction").
 *
 * Responsibilities:
 * 1. Runtime Schema Validation: Validates payload with Zod, enforcing strictly positive quantities and prices.
 * 2. Session Authentication: Verifies identity from the session cookie.
 * 3. Policy-Based Authorization: Executes write through `dbFor(user.id)`. ZenStack rejects writes from
 *    users with the VIEWER role (`403 Forbidden`).
 * 4. Ledger Immutability: Inserts an append-only transaction record. Updates/deletes are strictly denied.
 * 5. Audit Logging: Automatically creates an AuditLog row with `source: 'UI'`.
 */

import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { dbFor } from '@/lib/db';

// Positive decimal validator for quantities and unit prices
const positiveDecimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal number')
  .refine((val) => Number(val) > 0, {
    message: 'Amount must be greater than zero',
  });

// Non-negative decimal validator for fees
const nonNegativeDecimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal number');

// Request payload schema for direct transaction recording
const CreateTransactionSchema = z.object({
  portfolioId: z.string().min(1, 'Portfolio ID is required'),
  assetId: z.string().min(1, 'Asset ID is required'),
  type: z.enum(['BUY', 'SELL', 'DEPOSIT', 'WITHDRAW']),
  quantity: positiveDecimal,
  price: positiveDecimal,
  fee: nonNegativeDecimal.default('0'),
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
});

/**
 * POST /api/transactions
 * Directly records an append-only transaction entry from the dashboard modal.
 */
export async function POST(req: Request) {
  // 1. Verify user authentication
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse request JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 3. Validate input schema
  const parsed = CreateTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { portfolioId, ...txData } = parsed.data;
  const db = dbFor(user.id);

  // 4. Validate asset belongs to this portfolio and is accessible to this user
  const asset = await db.asset.findFirst({
    where: { id: txData.assetId, portfolioId },
  });

  if (!asset) {
    return Response.json({ error: 'Asset not found in this portfolio or access denied' }, { status: 404 });
  }

  try {
    // 5. Attempt transaction creation through ZenStack-enhanced client
    // ZenStack policy: @@allow('create', createdBy == auth().id && asset.portfolio.memberships?[user == auth() && (role == OWNER || role == EDITOR)])
    const transaction = await db.transaction.create({
      data: {
        assetId: txData.assetId,
        type: txData.type,
        quantity: txData.quantity,
        price: txData.price,
        fee: txData.fee,
        date: new Date(txData.date),
        createdBy: user.id,
      },
    });

    // 6. Record audit log entry documenting direct user action
    await db.auditLog.create({
      data: {
        userId: user.id,
        portfolioId,
        source: 'UI',
        action: 'transaction.create',
        payload: {
          transactionId: transaction.id,
          assetSymbol: asset.symbol,
          type: txData.type,
          quantity: txData.quantity,
          price: txData.price,
          fee: txData.fee,
        },
      },
    });

    return Response.json(transaction, { status: 201 });
  } catch {
    // Policy denial (e.g., Viewer attempting write) surfaces here from ZenStack
    return Response.json(
      { error: 'Transaction failed: insufficient permissions or policy rejection.' },
      { status: 403 }
    );
  }
}
