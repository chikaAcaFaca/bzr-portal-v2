/**
 * Firebase Authentication Middleware
 *
 * Replaces JWT-based auth with Firebase Auth token verification.
 * Resolves Firebase UID to agency_users record for multi-tenant access.
 */

import { Context } from 'hono';
import { verifyFirebaseToken } from '../../lib/firebase-admin';
import { db } from '../../db';
import { agencyUsers } from '../../db/schema/agency-users';
import { eq } from 'drizzle-orm';

export interface FirebaseAuthUser {
  firebaseUid: string;
  email: string;
  agencyUserId: number | null;
  agencyId: number | null;
  role: 'owner' | 'agent' | null;
  fullName: string | null;
}

/**
 * Middleware that requires Firebase Auth token.
 * Attaches resolved user (with agencyId) to context.
 */
export async function firebaseAuthMiddleware(c: Context, next: Function) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      { error: 'Unauthorized', message: 'Missing or invalid Authorization header' },
      401
    );
  }

  const token = authHeader.substring(7);

  try {
    // Verify Firebase ID token
    const decoded = await verifyFirebaseToken(token);

    // Look up agency user by Firebase UID
    const [agencyUser] = await db
      .select()
      .from(agencyUsers)
      .where(eq(agencyUsers.firebaseUid, decoded.uid))
      .limit(1);

    const user: FirebaseAuthUser = {
      firebaseUid: decoded.uid,
      email: decoded.email || '',
      agencyUserId: agencyUser?.id ?? null,
      agencyId: agencyUser?.agencyId ?? null,
      role: agencyUser?.role ?? null,
      fullName: agencyUser?.fullName ?? null,
    };

    c.set('firebaseUser', user);
    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid token';
    return c.json({ error: 'Unauthorized', message }, 401);
  }
}

/**
 * Optional Firebase auth - attaches user if token present, continues if not.
 */
export async function optionalFirebaseAuth(c: Context, next: Function) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = await verifyFirebaseToken(token);
      const [agencyUser] = await db
        .select()
        .from(agencyUsers)
        .where(eq(agencyUsers.firebaseUid, decoded.uid))
        .limit(1);

      c.set('firebaseUser', {
        firebaseUid: decoded.uid,
        email: decoded.email || '',
        agencyUserId: agencyUser?.id ?? null,
        agencyId: agencyUser?.agencyId ?? null,
        role: agencyUser?.role ?? null,
        fullName: agencyUser?.fullName ?? null,
      } satisfies FirebaseAuthUser);
    } catch {
      // Invalid token - continue as anonymous
    }
  }

  await next();
}

/**
 * Helper to get Firebase user from Hono context
 */
export function getFirebaseUser(c: Context): FirebaseAuthUser | undefined {
  return c.get('firebaseUser');
}

/**
 * Helper to require Firebase user (throws if not found)
 */
export function requireFirebaseUser(c: Context): FirebaseAuthUser {
  const user = c.get('firebaseUser');
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user;
}
