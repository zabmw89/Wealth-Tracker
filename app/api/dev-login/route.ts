/**
 * @file app/api/dev-login/route.ts
 * @description Development authentication endpoint used to switch between demo test personas.
 *
 * Usage:
 * - GET /api/dev-login?email=alice@demo.test (Owner)
 * - GET /api/dev-login?email=bob@demo.test (Editor)
 * - GET /api/dev-login?email=carol@demo.test (Viewer)
 * - Appending `&redirect=true` automatically issues an HTTP 302 redirect back to `/`.
 *
 * Security Note:
 * - This endpoint sets an HttpOnly cookie (`uid=<id>`) representing the authenticated persona.
 * - In a production deployment, this would be replaced with OAuth / OpenID Connect or Auth.js,
 *   which provides identical `{ id }` user context to the downstream policy layer.
 */

import { prismaAdmin } from '@/lib/db';

/**
 * GET /api/dev-login
 * Sets session cookie for the specified demo email.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email') ?? '';

  // Look up demo user by email using administrative client
  const user = await prismaAdmin.user.findUnique({ where: { email } });
  if (!user) {
    return new Response('Unknown user', { status: 404 });
  }

  // Attach session cookie to response headers
  const headers = new Headers();
  headers.set('Set-Cookie', `uid=${user.id}; Path=/; HttpOnly; SameSite=Lax`);

  // Support direct browser link navigation with redirect
  if (url.searchParams.get('redirect') === 'true') {
    headers.set('Location', '/');
    return new Response(null, { status: 302, headers });
  }

  return Response.json(
    { ok: true, user: { id: user.id, email: user.email, name: user.name } },
    { headers }
  );
}
