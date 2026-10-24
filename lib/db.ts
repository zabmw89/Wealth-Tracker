/**
 * @file lib/db.ts
 * @description Centralized Database Access Layer (DAL) establishing policy-enforced and administrative clients.
 *
 * Core Security Invariants:
 * 1. UNENHANCED Client (`prismaAdmin`):
 *    - Bypasses ZenStack access policies.
 *    - Restricted to seed scripts, global price snapshot updates, and initial portfolio creation
 *      (where no owner yet exists to authorize the first membership).
 *    - Never exposed directly to client-facing UI routes or AI agent tools.
 *
 * 2. ENHANCED Client (`dbFor(userId)`):
 *    - The ONLY client permitted for application route handlers and AI agent tools.
 *    - Dynamically binds ZenStack v2 runtime policies with `auth() = { id: userId }`.
 *    - Enforces row-level security (RLS), field protections, and role-based access control (RBAC).
 *    - Fails closed on unauthorized operations (e.g., Viewer attempting to create transactions).
 */

import { PrismaClient } from '@prisma/client';
import { enhance } from '@zenstackhq/runtime';

// Global singleton to prevent connection exhaustion during development Fast Refresh
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Unenhanced PrismaClient instance.
 * Bypasses all ZenStack access control policies. Use strictly for internal administrative tasks.
 */
export const prismaAdmin = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaAdmin;

/**
 * Factory function producing a policy-enforced database client scoped to an authenticated user.
 *
 * @param {string} userId - The verified user identifier from the active session.
 * @returns An enhanced PrismaClient proxy enforcing ZenStack policies for auth().id === userId.
 */
export const dbFor = (userId: string) => enhance(prismaAdmin, { user: { id: userId } });
