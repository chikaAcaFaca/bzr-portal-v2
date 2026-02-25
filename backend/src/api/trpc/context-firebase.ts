import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { db } from '../../db';
import { agencyUsers } from '../../db/schema/agency-users';
import { eq } from 'drizzle-orm';

/**
 * Firebase-based tRPC Context
 *
 * Replaces JWT-based context with Firebase Auth token verification.
 * Resolves Firebase UID to agency user for multi-tenant isolation.
 */

export interface FirebaseTRPCContext {
  db: typeof db;
  firebaseUid: string | null;
  email: string | null;
  agencyUserId: number | null;
  agencyId: number | null;
  role: 'owner' | 'agent' | null;
  fullName: string | null;
  req: Request;
}

export async function createFirebaseContext(
  opts: FetchCreateContextFnOptions
): Promise<FirebaseTRPCContext> {
  const { req } = opts;

  // Default unauthenticated context
  const ctx: FirebaseTRPCContext = {
    db,
    firebaseUid: null,
    email: null,
    agencyUserId: null,
    agencyId: null,
    role: null,
    fullName: null,
    req,
  };

  // Extract Firebase token from Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ctx;
  }

  const token = authHeader.substring(7);

  try {
    const { verifyFirebaseToken } = await import('../../lib/firebase-admin');
    const decoded = await verifyFirebaseToken(token);

    ctx.firebaseUid = decoded.uid;
    ctx.email = decoded.email || null;

    // Look up agency user
    const [agencyUser] = await db
      .select()
      .from(agencyUsers)
      .where(eq(agencyUsers.firebaseUid, decoded.uid))
      .limit(1);

    if (agencyUser) {
      ctx.agencyUserId = agencyUser.id;
      ctx.agencyId = agencyUser.agencyId;
      ctx.role = agencyUser.role;
      ctx.fullName = agencyUser.fullName;
    }
  } catch (error) {
    console.warn(
      'Firebase token verification failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }

  return ctx;
}

export type TRPCContext = Awaited<ReturnType<typeof createFirebaseContext>>;
