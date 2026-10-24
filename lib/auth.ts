/**
 * @file lib/auth.ts
 * @description Authentication helper to extract and verify the current user identity.
 *
 * Architecture Notes:
 * - Prototype Session Management: Reads an HttpOnly session cookie (`uid`) set by the login handler.
 * - Decoupled Design: The application layer and ZenStack data access layer only require an authenticated
 *   user object `{ id, ... }`. This makes it straightforward to replace the prototype cookie mechanism
 *   with an enterprise provider (e.g., Auth.js / NextAuth, Clerk, Supabase Auth) without altering
 *   downstream policy definitions or database models.
 */

import { cookies } from 'next/headers';
import { prismaAdmin } from './db';

/**
 * Retrieves the currently authenticated user from incoming request cookies.
 *
 * @returns {Promise<User | null>} The verified user record, or null if unauthenticated.
 */
export async function getUser() {
  const cookieStore = await cookies();
  const id = cookieStore.get('uid')?.value;
  if (!id) return null;

  return prismaAdmin.user.findUnique({ where: { id } });
}
