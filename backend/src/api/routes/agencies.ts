import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc/builder';
import { db } from '../../db';
import { agencies, type NewAgency } from '../../db/schema/agencies';
import { agencyUsers, type NewAgencyUser } from '../../db/schema/agency-users';
import { eq, ilike, and, or } from 'drizzle-orm';

/**
 * Agencies Router
 *
 * Handles agency registration, profile management, and agent management.
 */
export const agenciesRouter = router({
  /**
   * Register a new agency
   *
   * Called after Firebase account creation. Creates:
   * 1. Agency record with trial subscription
   * 2. Agency owner user record linked to Firebase UID
   *
   * Uses publicProcedure but requires a valid Firebase token in the header
   * (the user just registered, so they won't have an agency_user record yet).
   */
  register: publicProcedure
    .input(
      z.object({
        agencyName: z.string().min(2).max(255),
        pib: z.string().regex(/^[0-9]{9}$/, 'PIB mora imati tacno 9 cifara'),
        fullName: z.string().min(2).max(255),
        email: z.string().email(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get Firebase UID from context
      const firebaseUid = (ctx as any).firebaseUid as string | null;
      if (!firebaseUid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Morate biti prijavljeni za registraciju agencije',
        });
      }

      // Check if user already has an agency
      const [existingUser] = await db
        .select()
        .from(agencyUsers)
        .where(eq(agencyUsers.firebaseUid, firebaseUid))
        .limit(1);

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Vec imate registrovanu agenciju',
        });
      }

      // Check if PIB is already taken
      const [existingAgency] = await db
        .select()
        .from(agencies)
        .where(eq(agencies.pib, input.pib))
        .limit(1);

      if (existingAgency) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Agencija sa ovim PIB-om vec postoji',
        });
      }

      // Create agency with 30-day trial
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);

      const newAgency: NewAgency = {
        name: input.agencyName,
        pib: input.pib,
        email: input.email,
        directorName: input.fullName,
        address: '', // To be filled in settings
        subscriptionStatus: 'trial',
        trialEndsAt,
      };

      const [agency] = await db.insert(agencies).values(newAgency).returning();

      // Create owner user
      const newUser: NewAgencyUser = {
        agencyId: agency.id,
        firebaseUid,
        email: input.email,
        fullName: input.fullName,
        role: 'owner',
      };

      const [agencyUser] = await db.insert(agencyUsers).values(newUser).returning();

      return {
        agency: {
          id: agency.id,
          name: agency.name,
          pib: agency.pib,
          subscriptionStatus: agency.subscriptionStatus,
          trialEndsAt: agency.trialEndsAt,
        },
        user: {
          id: agencyUser.id,
          email: agencyUser.email,
          fullName: agencyUser.fullName,
          role: agencyUser.role,
        },
      };
    }),

  /**
   * Get current user's agency profile
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const agencyId = (ctx as any).agencyId as number | null;
    if (!agencyId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Niste registrovani ni u jednoj agenciji',
      });
    }

    const [agency] = await db
      .select()
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1);

    if (!agency) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Agencija nije pronadjena',
      });
    }

    const agencyUserId = (ctx as any).agencyUserId as number;
    const [user] = await db
      .select()
      .from(agencyUsers)
      .where(eq(agencyUsers.id, agencyUserId))
      .limit(1);

    return {
      agency,
      user: user || null,
    };
  }),

  /**
   * Update agency profile
   */
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(255).optional(),
        address: z.string().max(500).optional(),
        city: z.string().max(100).optional(),
        postalCode: z.string().max(10).optional(),
        phone: z.string().max(50).optional(),
        website: z.string().max(255).optional(),
        directorName: z.string().max(255).optional(),
        licenseNumber: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const agencyId = (ctx as any).agencyId as number | null;
      const role = (ctx as any).role as string | null;

      if (!agencyId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agencija nije pronadjena' });
      }

      if (role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Samo vlasnik agencije moze menjati podatke',
        });
      }

      const [updated] = await db
        .update(agencies)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(agencies.id, agencyId))
        .returning();

      return updated;
    }),

  /**
   * List agents in the agency
   */
  listAgents: protectedProcedure.query(async ({ ctx }) => {
    const agencyId = (ctx as any).agencyId as number | null;
    if (!agencyId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Agencija nije pronadjena' });
    }

    const agents = await db
      .select({
        id: agencyUsers.id,
        email: agencyUsers.email,
        fullName: agencyUsers.fullName,
        phone: agencyUsers.phone,
        role: agencyUsers.role,
        isActive: agencyUsers.isActive,
        createdAt: agencyUsers.createdAt,
        lastLoginAt: agencyUsers.lastLoginAt,
      })
      .from(agencyUsers)
      .where(eq(agencyUsers.agencyId, agencyId));

    return agents;
  }),

  /**
   * Create a new agent (owner only)
   */
  createAgent: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        fullName: z.string().min(2).max(255),
        firebaseUid: z.string().min(1),
        phone: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const agencyId = (ctx as any).agencyId as number | null;
      const role = (ctx as any).role as string | null;

      if (!agencyId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agencija nije pronadjena' });
      }

      if (role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Samo vlasnik agencije moze dodavati agente',
        });
      }

      // Check if email already exists
      const [existing] = await db
        .select()
        .from(agencyUsers)
        .where(eq(agencyUsers.email, input.email))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Korisnik sa ovim emailom vec postoji',
        });
      }

      const [agent] = await db
        .insert(agencyUsers)
        .values({
          agencyId,
          firebaseUid: input.firebaseUid,
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
          role: 'agent',
        })
        .returning();

      return agent;
    }),

  /**
   * Deactivate an agent (owner only)
   */
  deactivateAgent: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const agencyId = (ctx as any).agencyId as number | null;
      const role = (ctx as any).role as string | null;

      if (!agencyId || role !== 'owner') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate dozvolu' });
      }

      const [agent] = await db
        .select()
        .from(agencyUsers)
        .where(eq(agencyUsers.id, input.agentId))
        .limit(1);

      if (!agent || agent.agencyId !== agencyId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent nije pronadjen' });
      }

      if (agent.role === 'owner') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Ne mozete deaktivirati vlasnika agencije',
        });
      }

      await db
        .update(agencyUsers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(agencyUsers.id, input.agentId));

      return { success: true };
    }),

  // ============================================
  // B2B2C Marketplace: Public agency browsing
  // ============================================

  /**
   * List public agencies on the marketplace
   * Available to anyone (companies looking for a BZR agency)
   */
  listPublic: publicProcedure
    .input(
      z.object({
        search: z.string().max(100).optional(),
        city: z.string().max(100).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(20),
      }).optional()
    )
    .query(async ({ input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const conditions = [
        eq(agencies.isActive, true),
        eq(agencies.isPublicOnMarketplace, true),
      ];

      if (input?.city) {
        conditions.push(ilike(agencies.city, `%${input.city}%`));
      }

      if (input?.search) {
        conditions.push(
          or(
            ilike(agencies.name, `%${input.search}%`),
            ilike(agencies.description, `%${input.search}%`)
          )!
        );
      }

      const result = await db
        .select({
          id: agencies.id,
          name: agencies.name,
          city: agencies.city,
          description: agencies.description,
          specializations: agencies.specializations,
          rating: agencies.rating,
          reviewCount: agencies.reviewCount,
          coverageArea: agencies.coverageArea,
          logoUrl: agencies.logoUrl,
        })
        .from(agencies)
        .where(and(...conditions))
        .limit(pageSize)
        .offset(offset);

      return result;
    }),

  /**
   * Get public profile of a specific agency
   */
  getPublicProfile: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [agency] = await db
        .select({
          id: agencies.id,
          name: agencies.name,
          city: agencies.city,
          address: agencies.address,
          phone: agencies.phone,
          email: agencies.email,
          website: agencies.website,
          description: agencies.description,
          specializations: agencies.specializations,
          rating: agencies.rating,
          reviewCount: agencies.reviewCount,
          coverageArea: agencies.coverageArea,
          logoUrl: agencies.logoUrl,
          licenseNumber: agencies.licenseNumber,
        })
        .from(agencies)
        .where(
          and(
            eq(agencies.id, input.id),
            eq(agencies.isActive, true),
            eq(agencies.isPublicOnMarketplace, true)
          )
        )
        .limit(1);

      if (!agency) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agencija nije pronadjena' });
      }

      return agency;
    }),
});
