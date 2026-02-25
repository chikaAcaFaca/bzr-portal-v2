import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { db } from '../../db';
import { sql, eq } from 'drizzle-orm';
import { agencyUsers } from '../../db/schema/agency-users';
import { companies } from '../../db/schema/companies';
import type { AccessTokenPayload } from '../../lib/utils/jwt';

/**
 * Unified tRPC Context
 *
 * Supports both legacy JWT auth and Firebase Auth.
 * Tries Firebase token first, then falls back to JWT.
 *
 * B2B2C marketplace: After Firebase lookup, checks agencyUsers first,
 * then companies (self-registered firms) if not found.
 */

export interface Context {
  db: typeof db;
  // Legacy JWT fields
  userId: number | null;
  user: AccessTokenPayload | null;
  // Firebase fields
  firebaseUid: string | null;
  email: string | null;
  agencyUserId: number | null;
  agencyId: number | null;
  role: 'owner' | 'agent' | null;
  fullName: string | null;
  // B2B2C marketplace fields
  companyOwnerId: number | null; // companies.id where firebaseUid matches
  userType: 'agency' | 'company' | null;
  req: Request;
}

export async function createContext(opts: FetchCreateContextFnOptions): Promise<Context> {
  const { req } = opts;

  const ctx: Context = {
    db,
    userId: null,
    user: null,
    firebaseUid: null,
    email: null,
    agencyUserId: null,
    agencyId: null,
    role: null,
    fullName: null,
    companyOwnerId: null,
    userType: null,
    req,
  };

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ctx;
  }

  const token = authHeader.substring(7);

  // Try Firebase Auth first
  try {
    const { verifyFirebaseToken } = await import('../../lib/firebase-admin');
    const decoded = await verifyFirebaseToken(token);

    ctx.firebaseUid = decoded.uid;
    ctx.email = decoded.email || null;

    // Look up agency user first
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
      ctx.userType = 'agency';
      return ctx;
    }

    // Not an agency user → check if company owner (self-registered firm)
    const [companyOwner] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.firebaseUid, decoded.uid))
      .limit(1);

    if (companyOwner) {
      ctx.companyOwnerId = companyOwner.id;
      ctx.userType = 'company';
    }

    return ctx;
  } catch {
    // Not a Firebase token - try legacy JWT
  }

  // Fallback: Legacy JWT
  try {
    const { verifyAccessToken } = await import('../../lib/utils/jwt');
    const payload = verifyAccessToken(token);
    ctx.userId = payload.userId;
    ctx.user = payload;

    if (payload.companyId !== null) {
      try {
        await db.execute(
          sql`SET LOCAL app.current_company_id = ${payload.companyId.toString()}`
        );
      } catch {
        // Continue - application-layer RLS will still work
      }
    }
  } catch {
    // Invalid token
  }

  return ctx;
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;
