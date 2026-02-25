import { router, publicProcedure, protectedProcedure, companyOwnerProcedure } from '../trpc/builder';
import { CompanyService } from '../../services/CompanyService';
import { createCompanySchema, updateCompanySchema } from '../../schemas/company';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { db } from '../../db';
import { companies } from '../../db/schema/companies';
import { eq, and, ilike, or } from 'drizzle-orm';
import { getPricingTier, PRICING_TIERS } from '../../db/schema/subscriptions';

/**
 * Companies tRPC Router
 *
 * Implements companies.contract.md endpoints:
 * - companies.create
 * - companies.getById
 * - companies.list
 * - companies.update
 * - companies.delete
 */

export const companiesRouter = router({
  /**
   * Create new company
   *
   * Input: Company data (validated by createCompanySchema)
   * Output: Created company
   * Errors: BAD_REQUEST (validation), CONFLICT (duplicate PIB)
   */
  create: protectedProcedure.input(createCompanySchema).mutation(async ({ ctx, input }) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    return CompanyService.create({ ...input, userId: ctx.userId });
  }),

  /**
   * Get company by ID
   *
   * Input: { id: number }
   * Output: Company
   * Errors: NOT_FOUND, FORBIDDEN
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      return CompanyService.getById(input.id, ctx.userId);
    }),

  /**
   * List all companies for current user
   *
   * Input: none
   * Output: Company[]
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    return CompanyService.listByUser(ctx.userId);
  }),

  /**
   * Update company
   *
   * Input: { id: number, ...updated fields }
   * Output: Updated company
   * Errors: NOT_FOUND, FORBIDDEN, BAD_REQUEST
   */
  update: protectedProcedure.input(updateCompanySchema.extend({ id: z.number() })).mutation(async ({ ctx, input }) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    return CompanyService.update({ ...input, userId: ctx.userId });
  }),

  /**
   * Soft delete company
   *
   * Input: { id: number }
   * Output: Deleted company
   * Errors: NOT_FOUND, FORBIDDEN
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await CompanyService.delete(input.id, ctx.userId);
      return { success: true };
    }),

  // ============================================
  // Agency-aware endpoints (multi-tenant)
  // ============================================

  /**
   * List companies for the current user's agency
   */
  listByAgency: protectedProcedure.query(async ({ ctx }) => {
    const agencyId = ctx.agencyId;
    if (!agencyId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Niste deo nijedne agencije' });
    }

    const result = await db
      .select({
        id: companies.id,
        name: companies.name,
        pib: companies.pib,
        city: companies.city,
        employeeCount: companies.employeeCount,
        pricingTier: companies.pricingTier,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(and(eq(companies.agencyId, agencyId), eq(companies.isDeleted, false)));

    return result;
  }),

  /**
   * Get company by ID (agency-scoped)
   */
  getByIdForAgency: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const agencyId = ctx.agencyId;
      if (!agencyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Niste deo nijedne agencije' });
      }

      const [company] = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.id, input.id),
            eq(companies.agencyId, agencyId),
            eq(companies.isDeleted, false)
          )
        )
        .limit(1);

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Klijent nije pronadjen' });
      }

      return company;
    }),

  /**
   * Create company for agency
   */
  createForAgency: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(255),
        pib: z.string().regex(/^[0-9]{9}$/),
        activityCode: z.string().regex(/^[0-9]{4}$/),
        activityDescription: z.string().max(500).optional(),
        address: z.string().min(2).max(500),
        city: z.string().max(100).optional(),
        postalCode: z.string().max(10).optional(),
        phone: z.string().max(50).optional(),
        email: z.string().email().optional(),
        director: z.string().min(2).max(255),
        bzrResponsiblePerson: z.string().min(2).max(255),
        employeeCount: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const agencyId = ctx.agencyId;
      const agentId = ctx.agencyUserId;
      if (!agencyId || !agentId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Niste deo nijedne agencije' });
      }

      // Check for duplicate PIB within agency
      const [existing] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.agencyId, agencyId),
            eq(companies.pib, input.pib),
            eq(companies.isDeleted, false)
          )
        )
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Klijent sa ovim PIB-om vec postoji u vasoj agenciji',
        });
      }

      const tier = getPricingTier(input.employeeCount);

      const [company] = await db
        .insert(companies)
        .values({
          agencyId,
          assignedAgentId: agentId,
          name: input.name,
          pib: input.pib,
          activityCode: input.activityCode,
          activityDescription: input.activityDescription || null,
          address: input.address,
          city: input.city || null,
          postalCode: input.postalCode || null,
          phone: input.phone || null,
          email: input.email || null,
          director: input.director,
          bzrResponsiblePerson: input.bzrResponsiblePerson,
          employeeCount: input.employeeCount,
          pricingTier: tier,
        })
        .returning();

      return company;
    }),

  /**
   * Delete company (agency-scoped, soft delete)
   */
  deleteForAgency: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const agencyId = ctx.agencyId;
      if (!agencyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Niste deo nijedne agencije' });
      }

      const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.id, input.id),
            eq(companies.agencyId, agencyId),
            eq(companies.isDeleted, false)
          )
        )
        .limit(1);

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Klijent nije pronadjen' });
      }

      await db
        .update(companies)
        .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(companies.id, input.id));

      return { success: true };
    }),

  // ============================================
  // B2B2C Marketplace: Self-registration endpoints
  // ============================================

  /**
   * Self-register a company (firma)
   * Called after Firebase account creation by company owners.
   */
  registerSelf: publicProcedure
    .input(
      z.object({
        name: z.string().min(2).max(255),
        pib: z.string().regex(/^[0-9]{9}$/, 'PIB mora imati tacno 9 cifara'),
        employeeCount: z.number().int().min(1),
        email: z.string().email(),
        fullName: z.string().min(2).max(255),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const firebaseUid = (ctx as any).firebaseUid as string | null;
      if (!firebaseUid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Morate biti prijavljeni za registraciju firme',
        });
      }

      // Check if user already registered a company
      const [existingCompany] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.firebaseUid, firebaseUid))
        .limit(1);

      if (existingCompany) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Vec imate registrovanu firmu',
        });
      }

      // Check for duplicate PIB
      const [existingPib] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.pib, input.pib), eq(companies.isDeleted, false)))
        .limit(1);

      if (existingPib) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Firma sa ovim PIB-om vec postoji',
        });
      }

      const tier = getPricingTier(input.employeeCount);

      // 30-day trial
      const trialExpiry = new Date();
      trialExpiry.setDate(trialExpiry.getDate() + 30);

      const [company] = await db
        .insert(companies)
        .values({
          name: input.name,
          pib: input.pib,
          employeeCount: input.employeeCount,
          firebaseUid,
          ownerEmail: input.email,
          ownerFullName: input.fullName,
          pricingTier: tier,
          activityCode: '0000', // Placeholder - to be filled later
          address: '', // To be filled in settings
          director: input.fullName,
          bzrResponsiblePerson: '',
          accountTier: 'trial',
          trialExpiryDate: trialExpiry,
          connectionStatus: 'none',
        })
        .returning();

      return {
        id: company.id,
        name: company.name,
        pib: company.pib,
        pricingTier: company.pricingTier,
        trialExpiryDate: company.trialExpiryDate,
      };
    }),

  /**
   * Get current company owner's profile
   */
  myProfile: companyOwnerProcedure.query(async ({ ctx }) => {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, ctx.companyOwnerId))
      .limit(1);

    if (!company) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Firma nije pronadjena' });
    }

    return company;
  }),

  /**
   * Get IPS QR payment info for current company
   */
  getPaymentInfo: companyOwnerProcedure.query(async ({ ctx }) => {
    const [company] = await db
      .select({
        id: companies.id,
        name: companies.name,
        pricingTier: companies.pricingTier,
        billingCycle: companies.billingCycle,
        employeeCount: companies.employeeCount,
        accountTier: companies.accountTier,
        trialExpiryDate: companies.trialExpiryDate,
        subscriptionPaidUntil: companies.subscriptionPaidUntil,
        lastPaymentAt: companies.lastPaymentAt,
      })
      .from(companies)
      .where(eq(companies.id, ctx.companyOwnerId))
      .limit(1);

    if (!company) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Firma nije pronadjena' });
    }

    const tier = company.pricingTier as keyof typeof PRICING_TIERS | null;
    const tierInfo = tier ? PRICING_TIERS[tier] : null;
    const monthlyPrice = tierInfo?.monthlyRsd ?? 0;
    const annualPrice = tierInfo?.annualRsd ?? 0;

    // Generate poziv na broj: companyId + MMYYYY
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());
    const pozivNaBroj = `${company.id}-${month}${year}`;

    // Determine subscription status
    let status: 'trial' | 'active' | 'expired' = 'trial';
    if (company.subscriptionPaidUntil && company.subscriptionPaidUntil > now) {
      status = 'active';
    } else if (company.trialExpiryDate && company.trialExpiryDate < now) {
      status = 'expired';
    }

    return {
      companyId: company.id,
      companyName: company.name,
      pricingTier: company.pricingTier,
      tierLabel: tierInfo?.label ?? 'Nepoznat paket',
      monthlyPrice,
      annualPrice,
      pozivNaBroj,
      status,
      trialExpiryDate: company.trialExpiryDate,
      subscriptionPaidUntil: company.subscriptionPaidUntil,
      lastPaymentAt: company.lastPaymentAt,
    };
  }),
});
