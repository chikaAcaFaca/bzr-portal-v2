import { initTRPC, TRPCError } from '@trpc/server';
import { type TRPCContext } from './context';
import superjson from 'superjson';

/**
 * tRPC Builder (separated to avoid circular dependencies)
 *
 * Supports both legacy JWT auth (ctx.userId) and Firebase Auth (ctx.firebaseUid).
 * During migration, protectedProcedure accepts either auth method.
 */

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause,
      },
    };
  },
});

/**
 * Base router builder
 */
export const router = t.router;

/**
 * Public procedure (no authentication required)
 */
export const publicProcedure = t.procedure;

/**
 * Protected procedure (requires authentication)
 * Accepts either legacy JWT userId or Firebase UID
 */
export const protectedProcedure = t.procedure.use(async (opts) => {
  const { ctx } = opts;

  // Accept either legacy JWT or Firebase Auth
  const isAuthenticated = ctx.userId || ctx.firebaseUid;

  if (!isAuthenticated) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Morate biti prijavljeni' });
  }

  return opts.next({
    ctx: {
      ...ctx,
      userId: ctx.userId ?? 0, // Legacy compatibility
    },
  });
});

/**
 * Company owner procedure (requires Firebase auth + company ownership)
 * Used for B2B2C marketplace - self-registered firms
 */
export const companyOwnerProcedure = t.procedure.use(async (opts) => {
  const { ctx } = opts;

  if (!ctx.firebaseUid) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Morate biti prijavljeni' });
  }

  if (!ctx.companyOwnerId || ctx.userType !== 'company') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate pristup kao vlasnik firme' });
  }

  return opts.next({
    ctx: {
      ...ctx,
      companyOwnerId: ctx.companyOwnerId,
      userType: ctx.userType as 'company',
    },
  });
});
