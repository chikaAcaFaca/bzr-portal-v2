import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, companyOwnerProcedure } from '../trpc/builder';
import { db } from '../../db';
import { companyDirectory } from '../../db/schema/company-directory';
import { companyPosts } from '../../db/schema/company-posts';
import { companies } from '../../db/schema/companies';
import { agencies } from '../../db/schema/agencies';
import { getPricingTier } from '../../db/schema/subscriptions';
import { eq, ilike, and, sql, desc, gte, isNull, isNotNull } from 'drizzle-orm';
import { enrichCompany } from '../../services/apr-enrichment.service';
import { enrichFromCompanyWall } from '../../services/companywall-enrichment.service';
import { randomBytes } from 'crypto';
import { sendCompanyInviteEmail, sendOnboardingNotificationEmail, sendNurtureEmail } from '../../services/email.service';

/**
 * Normalize search text for Serbian: Cyrillic→Latin, remove diacritics, lowercase.
 * Allows users to search with Cyrillic, Latin, or ASCII-only input.
 */
function normalizeForSearch(text: string): string {
  const cyrMap: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'dj', 'е': 'e',
    'ж': 'z', 'з': 'z', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj',
    'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's',
    'т': 't', 'ћ': 'c', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'c',
    'џ': 'dz', 'ш': 's',
    'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Ђ': 'dj', 'Е': 'e',
    'Ж': 'z', 'З': 'z', 'И': 'i', 'Ј': 'j', 'К': 'k', 'Л': 'l', 'Љ': 'lj',
    'М': 'm', 'Н': 'n', 'Њ': 'nj', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's',
    'Т': 't', 'Ћ': 'c', 'У': 'u', 'Ф': 'f', 'Х': 'h', 'Ц': 'c', 'Ч': 'c',
    'Џ': 'dz', 'Ш': 's',
  };

  let result = '';
  for (const char of text) {
    result += cyrMap[char] || char;
  }

  // Remove Latin diacritics
  return result
    .replace(/[čćČĆ]/g, 'c')
    .replace(/[šŠ]/g, 's')
    .replace(/[đĐ]/g, 'd')
    .replace(/[žŽ]/g, 'z')
    .toLowerCase()
    .trim();
}

/**
 * SQL expression to normalize a column for search comparison.
 * Handles both Cyrillic (in opstina) and Latin diacritics (in poslovnoIme).
 * Cyrillic chars (30): абвгдђежзијклљмнњопрстћуфхцчџш
 * Latin diacritics (5): čćšđž
 * Digraphs (љ,њ,џ) become single chars (l,n,d) - acceptable for search.
 */
const CYR_FROM = 'абвгдђежзијклљмнњопрстћуфхцчџшčćšđž';
const CYR_TO   = 'abvgddezzijkllmnnoprstcufhccdsccsdz';
const normalizedPoslovnoIme = sql`translate(lower(${companyDirectory.poslovnoIme}), ${CYR_FROM}, ${CYR_TO})`;
const normalizedOpstina = sql`translate(lower(${companyDirectory.opstina}), ${CYR_FROM}, ${CYR_TO})`;

/**
 * Company Directory Router
 *
 * Endpoints for browsing the 750k+ company directory (APR data).
 * Used by agencies for lead generation and for public company profiles.
 */
export const companyDirectoryRouter = router({
  /**
   * Public: Look up company by PIB (9-digit tax ID)
   * Used during registration for auto-population
   */
  lookupByPib: publicProcedure
    .input(z.object({ pib: z.string().regex(/^[0-9]{9}$/) }))
    .query(async ({ input }) => {
      // 1. Check company_directory by pib
      const [dirEntry] = await db.select({
        poslovnoIme: companyDirectory.poslovnoIme,
        maticniBroj: companyDirectory.maticniBroj,
        opstina: companyDirectory.opstina,
        grad: companyDirectory.grad,
        brojZaposlenih: companyDirectory.brojZaposlenih,
        sifraDelatnosti: companyDirectory.sifraDelatnosti,
        adresa: companyDirectory.adresa,
        pravnaForma: companyDirectory.pravnaForma,
      })
      .from(companyDirectory)
      .where(eq(companyDirectory.pib, input.pib))
      .limit(1);

      if (dirEntry) {
        return { found: true as const, source: 'directory' as const, ...dirEntry };
      }

      // 2. Check companies table (already registered)
      const [existing] = await db.select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.pib, input.pib), eq(companies.isDeleted, false)))
        .limit(1);

      if (existing) {
        return { found: true as const, source: 'registered' as const, alreadyRegistered: true as const };
      }

      return { found: false as const };
    }),

  /**
   * List companies with pagination and filters
   */
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().max(200).optional(),
        sifraDelatnosti: z.string().max(10).optional(),
        sifraOpstine: z.string().max(10).optional(),
        opstina: z.string().max(255).optional(),
        registrovan: z.boolean().optional(),
        hasAgency: z.boolean().optional(),
        minZaposlenih: z.number().int().min(0).optional(),
        maxZaposlenih: z.number().int().max(100000).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(25),
      })
    )
    .query(async ({ input }) => {
      const { page, pageSize, ...filters } = input;
      const offset = (page - 1) * pageSize;

      const conditions = [];

      if (filters.search) {
        const normalized = normalizeForSearch(filters.search);
        if (normalized) {
          conditions.push(sql`${normalizedPoslovnoIme} LIKE ${'%' + normalized + '%'}`);
        }
      }
      if (filters.sifraDelatnosti) {
        conditions.push(eq(companyDirectory.sifraDelatnosti, filters.sifraDelatnosti));
      }
      if (filters.sifraOpstine) {
        conditions.push(eq(companyDirectory.sifraOpstine, filters.sifraOpstine));
      }
      if (filters.opstina) {
        const normalizedOps = normalizeForSearch(filters.opstina);
        if (normalizedOps) {
          conditions.push(sql`${normalizedOpstina} LIKE ${'%' + normalizedOps + '%'}`);
        }
      }
      if (filters.registrovan !== undefined) {
        conditions.push(eq(companyDirectory.registrovan, filters.registrovan));
      }
      if (filters.hasAgency === true) {
        conditions.push(isNotNull(companyDirectory.bzrAgencijaId));
      }
      if (filters.hasAgency === false) {
        conditions.push(isNull(companyDirectory.bzrAgencijaId));
      }
      if (filters.minZaposlenih !== undefined) {
        conditions.push(sql`${companyDirectory.brojZaposlenih} >= ${filters.minZaposlenih}`);
      }
      if (filters.maxZaposlenih !== undefined) {
        conditions.push(sql`${companyDirectory.brojZaposlenih} <= ${filters.maxZaposlenih}`);
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db
          .select({
            id: companyDirectory.id,
            maticniBroj: companyDirectory.maticniBroj,
            poslovnoIme: companyDirectory.poslovnoIme,
            pravnaForma: companyDirectory.pravnaForma,
            sifraDelatnosti: companyDirectory.sifraDelatnosti,
            opstina: companyDirectory.opstina,
            status: companyDirectory.status,
            brojZaposlenih: companyDirectory.brojZaposlenih,
            registrovan: companyDirectory.registrovan,
            pretplataAktivna: companyDirectory.pretplataAktivna,
            bzrAgencijaId: companyDirectory.bzrAgencijaId,
            bzrAgencijaNaziv: companyDirectory.bzrAgencijaNaziv,
          })
          .from(companyDirectory)
          .where(whereClause)
          .orderBy(companyDirectory.poslovnoIme)
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(companyDirectory)
          .where(whereClause),
      ]);

      return {
        items,
        total: countResult[0]?.count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((countResult[0]?.count ?? 0) / pageSize),
      };
    }),

  /**
   * Get single company by maticni broj (triggers enrichment if stale)
   */
  getByMaticniBroj: protectedProcedure
    .input(z.object({ maticniBroj: z.string().min(1).max(8) }))
    .query(async ({ input }) => {
      const [company] = await db
        .select()
        .from(companyDirectory)
        .where(eq(companyDirectory.maticniBroj, input.maticniBroj))
        .limit(1);

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Firma nije pronadjena u direktorijumu' });
      }

      // Trigger APR enrichment if stale (async, don't block response)
      if (!company.enrichedAt || (Date.now() - company.enrichedAt.getTime()) > 30 * 24 * 60 * 60 * 1000) {
        enrichCompany(input.maticniBroj).catch((err) => {
          console.error(`APR enrichment failed for ${input.maticniBroj}:`, err);
        });
      }

      // Trigger CompanyWall enrichment if stale (async, don't block response)
      if (!company.cwEnrichedAt || (Date.now() - company.cwEnrichedAt.getTime()) > 90 * 24 * 60 * 60 * 1000) {
        enrichFromCompanyWall(input.maticniBroj).catch((err) => {
          console.error(`CompanyWall enrichment failed for ${input.maticniBroj}:`, err);
        });
      }

      return company;
    }),

  /**
   * Public listing - browse companies without auth (for SEO directory pages)
   */
  publicList: publicProcedure
    .input(
      z.object({
        search: z.string().max(200).optional(),
        sifraDelatnosti: z.string().max(10).optional(),
        opstina: z.string().max(255).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(50).default(25),
      })
    )
    .query(async ({ input }) => {
      const { page, pageSize, ...filters } = input;
      const offset = (page - 1) * pageSize;

      const conditions = [];

      if (filters.search) {
        const normalized = normalizeForSearch(filters.search);
        if (normalized) {
          // Search normalized column (handles Cyrillic input, diacritics, ASCII-only)
          conditions.push(sql`${normalizedPoslovnoIme} LIKE ${'%' + normalized + '%'}`);
        }
      }
      if (filters.sifraDelatnosti) {
        // Support prefix matching: "41" matches "4110", "4120", etc.
        conditions.push(ilike(companyDirectory.sifraDelatnosti, `${filters.sifraDelatnosti}%`));
      }
      if (filters.opstina) {
        // Normalize opstina search too (Cyrillic in DB, user may type Latin)
        const normalizedOps = normalizeForSearch(filters.opstina);
        if (normalizedOps) {
          conditions.push(sql`${normalizedOpstina} LIKE ${'%' + normalizedOps + '%'}`);
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db
          .select({
            maticniBroj: companyDirectory.maticniBroj,
            poslovnoIme: companyDirectory.poslovnoIme,
            pravnaForma: companyDirectory.pravnaForma,
            sifraDelatnosti: companyDirectory.sifraDelatnosti,
            opstina: companyDirectory.opstina,
            brojZaposlenih: companyDirectory.brojZaposlenih,
            registrovan: companyDirectory.registrovan,
          })
          .from(companyDirectory)
          .where(whereClause)
          .orderBy(companyDirectory.poslovnoIme)
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(companyDirectory)
          .where(whereClause),
      ]);

      return {
        items,
        total: countResult[0]?.count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((countResult[0]?.count ?? 0) / pageSize),
      };
    }),

  /**
   * Public profile data (limited fields for SEO pages)
   */
  getPublicProfile: publicProcedure
    .input(z.object({ maticniBroj: z.string().min(1).max(8) }))
    .query(async ({ input }) => {
      const [company] = await db
        .select({
          id: companyDirectory.id,
          maticniBroj: companyDirectory.maticniBroj,
          poslovnoIme: companyDirectory.poslovnoIme,
          pravnaForma: companyDirectory.pravnaForma,
          sifraDelatnosti: companyDirectory.sifraDelatnosti,
          opstina: companyDirectory.opstina,
          sifraOpstine: companyDirectory.sifraOpstine,
          datumOsnivanja: companyDirectory.datumOsnivanja,
          status: companyDirectory.status,
          grad: companyDirectory.grad,
          brojZaposlenih: companyDirectory.brojZaposlenih,
          registrovan: companyDirectory.registrovan,
          pretplataAktivna: companyDirectory.pretplataAktivna,
          bzrAgencijaNaziv: companyDirectory.bzrAgencijaNaziv,
          // Mini website fields
          kratakOpis: companyDirectory.kratakOpis,
          usluge: companyDirectory.usluge,
          logoUrl: companyDirectory.logoUrl,
          claimedAt: companyDirectory.claimedAt,
          // CompanyWall financial data (public)
          prihod: companyDirectory.prihod,
          rashod: companyDirectory.rashod,
          dobitGubitak: companyDirectory.dobitGubitak,
          kapital: companyDirectory.kapital,
          companyWallUrl: companyDirectory.companyWallUrl,
          // Contact info only if flagged as visible
          telefonVidljiv: companyDirectory.telefonVidljiv,
          emailVidljiv: companyDirectory.emailVidljiv,
          telefon: companyDirectory.telefon,
          email: companyDirectory.email,
          webSajt: companyDirectory.webSajt,
          adresa: companyDirectory.adresa,
        })
        .from(companyDirectory)
        .where(eq(companyDirectory.maticniBroj, input.maticniBroj))
        .limit(1);

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Firma nije pronadjena' });
      }

      // Mask contact info if not flagged as visible
      return {
        ...company,
        telefon: company.telefonVidljiv ? company.telefon : null,
        email: company.emailVidljiv ? company.email : null,
      };
    }),

  /**
   * Directory statistics for dashboard
   */
  stats: protectedProcedure.query(async () => {
    const [result] = await db
      .select({
        total: sql<number>`count(*)::int`,
        registered: sql<number>`count(*) filter (where ${companyDirectory.registrovan} = true)::int`,
        withAgency: sql<number>`count(*) filter (where ${companyDirectory.bzrAgencijaId} is not null)::int`,
        withSubscription: sql<number>`count(*) filter (where ${companyDirectory.pretplataAktivna} = true)::int`,
        enriched: sql<number>`count(*) filter (where ${companyDirectory.enrichedAt} is not null)::int`,
      })
      .from(companyDirectory);

    return result!;
  }),

  /**
   * Hot leads: companies with active subscription but no BZR agency
   * Agency-only endpoint for lead generation
   */
  hotLeads: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(25),
        opstina: z.string().max(255).optional(),
        sifraDelatnosti: z.string().max(10).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const agencyId = (ctx as any).agencyId as number | null;
      if (!agencyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Samo agencije mogu pristupiti vrucim lidovima' });
      }

      const { page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      const conditions = [
        eq(companyDirectory.pretplataAktivna, true),
        isNull(companyDirectory.bzrAgencijaId),
      ];

      if (input.opstina) {
        conditions.push(ilike(companyDirectory.opstina, `%${input.opstina}%`));
      }
      if (input.sifraDelatnosti) {
        conditions.push(eq(companyDirectory.sifraDelatnosti, input.sifraDelatnosti));
      }

      const whereClause = and(...conditions);

      const [items, countResult] = await Promise.all([
        db
          .select({
            id: companyDirectory.id,
            maticniBroj: companyDirectory.maticniBroj,
            poslovnoIme: companyDirectory.poslovnoIme,
            sifraDelatnosti: companyDirectory.sifraDelatnosti,
            opstina: companyDirectory.opstina,
            brojZaposlenih: companyDirectory.brojZaposlenih,
            pretplata: companyDirectory.pretplata,
          })
          .from(companyDirectory)
          .where(whereClause)
          .orderBy(desc(companyDirectory.updatedAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(companyDirectory)
          .where(whereClause),
      ]);

      return {
        items,
        total: countResult[0]?.count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((countResult[0]?.count ?? 0) / pageSize),
      };
    }),

  // ============================================
  // Mini Website: Claim & Update Profile
  // ============================================

  /**
   * Claim a company profile - link the registered company to their directory entry
   * Verifies that PIB from the companies table matches the company_directory entry
   */
  claimProfile: companyOwnerProcedure
    .input(z.object({ maticniBroj: z.string().min(1).max(8) }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.companyOwnerId;

      // Get the registered company's PIB
      const [company] = await db
        .select({ id: companies.id, pib: companies.pib, name: companies.name, phone: companies.phone, email: companies.email })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Registrovana firma nije pronadjena' });
      }

      // Find the directory entry
      const [dirEntry] = await db
        .select()
        .from(companyDirectory)
        .where(eq(companyDirectory.maticniBroj, input.maticniBroj))
        .limit(1);

      if (!dirEntry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Firma nije pronadjena u direktorijumu' });
      }

      // Check if already claimed
      if (dirEntry.claimedByCompanyId) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Ova firma je vec preuzeta' });
      }

      // Update directory entry
      const [updated] = await db
        .update(companyDirectory)
        .set({
          claimedAt: new Date(),
          claimedByCompanyId: companyId,
          registrovan: true,
          datumRegistracije: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companyDirectory.maticniBroj, input.maticniBroj))
        .returning();

      return { success: true, maticniBroj: updated.maticniBroj };
    }),

  /**
   * Update claimed company profile (mini website personalization)
   * Only the company that claimed the profile can update it
   */
  updateMyProfile: companyOwnerProcedure
    .input(
      z.object({
        kratakOpis: z.string().max(500).optional(),
        usluge: z.string().max(1000).optional(),
        telefonVidljiv: z.boolean().optional(),
        emailVidljiv: z.boolean().optional(),
        kontaktFormAktivna: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.companyOwnerId;

      // Find directory entry claimed by this company
      const [dirEntry] = await db
        .select({ id: companyDirectory.id, maticniBroj: companyDirectory.maticniBroj })
        .from(companyDirectory)
        .where(eq(companyDirectory.claimedByCompanyId, companyId))
        .limit(1);

      if (!dirEntry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Nemate preuzetu stranicu firme. Prvo preuzmite profil.',
        });
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (input.kratakOpis !== undefined) updateData.kratakOpis = input.kratakOpis;
      if (input.usluge !== undefined) updateData.usluge = input.usluge;
      if (input.telefonVidljiv !== undefined) updateData.telefonVidljiv = input.telefonVidljiv;
      if (input.emailVidljiv !== undefined) updateData.emailVidljiv = input.emailVidljiv;
      if (input.kontaktFormAktivna !== undefined) updateData.kontaktFormAktivna = input.kontaktFormAktivna;

      const [updated] = await db
        .update(companyDirectory)
        .set(updateData)
        .where(eq(companyDirectory.id, dirEntry.id))
        .returning();

      return updated;
    }),

  // ============================================
  // Invite System: Batch email invitations
  // ============================================

  /**
   * Send invite emails to companies that have email but haven't been invited
   * Protected: admin/agency users only
   */
  sendInvites: protectedProcedure
    .input(
      z.object({
        filter: z.object({
          sifraDelatnosti: z.string().max(10).optional(),
          opstina: z.string().max(255).optional(),
          limit: z.number().int().min(1).max(100).default(50),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const { filter } = input;

      // Build query conditions: has email, not invited, not registered
      const conditions = [
        isNotNull(companyDirectory.email),
        isNull(companyDirectory.inviteSentAt),
        eq(companyDirectory.registrovan, false),
      ];

      if (filter.sifraDelatnosti) {
        conditions.push(ilike(companyDirectory.sifraDelatnosti, `${filter.sifraDelatnosti}%`));
      }
      if (filter.opstina) {
        conditions.push(ilike(companyDirectory.opstina, `%${filter.opstina}%`));
      }

      // Get companies to invite
      const toInvite = await db
        .select({
          id: companyDirectory.id,
          maticniBroj: companyDirectory.maticniBroj,
          poslovnoIme: companyDirectory.poslovnoIme,
          email: companyDirectory.email,
        })
        .from(companyDirectory)
        .where(and(...conditions))
        .limit(filter.limit);

      let sent = 0;
      const errors: string[] = [];

      for (const company of toInvite) {
        if (!company.email) continue;

        try {
          // Generate unique invite token
          const inviteToken = randomBytes(32).toString('hex');

          // Send email
          await sendCompanyInviteEmail({
            to: company.email,
            companyName: company.poslovnoIme,
            maticniBroj: company.maticniBroj,
            inviteToken,
          });

          // Mark as invited
          await db
            .update(companyDirectory)
            .set({
              inviteSentAt: new Date(),
              inviteToken,
              updatedAt: new Date(),
            })
            .where(eq(companyDirectory.id, company.id));

          sent++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`${company.poslovnoIme} (${company.email}): ${message}`);
        }
      }

      return { sent, total: toInvite.length, errors };
    }),

  // ============================================
  // CompanyWall Enrichment
  // ============================================

  /**
   * Manually trigger CompanyWall enrichment for a company
   */
  enrichFromCompanyWall: protectedProcedure
    .input(z.object({ maticniBroj: z.string().min(1).max(8) }))
    .mutation(async ({ input }) => {
      const result = await enrichFromCompanyWall(input.maticniBroj);
      if (!result) {
        return { enriched: false, message: 'Firma nije pronadjena ili su podaci svezi' };
      }
      return { enriched: true, data: result };
    }),

  // ============================================
  // Agency Onboard Client Workflow
  // ============================================

  /**
   * Agency onboards a client company from the directory
   * Creates company record, triggers enrichment, sends notification
   */
  agencyOnboardClient: protectedProcedure
    .input(z.object({
      maticniBroj: z.string().min(1).max(8),
      sendNotification: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const agencyId = ctx.agencyId;
      if (!agencyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Samo agencije mogu preuzimati klijente' });
      }

      // Fetch directory entry
      const [dirEntry] = await db
        .select()
        .from(companyDirectory)
        .where(eq(companyDirectory.maticniBroj, input.maticniBroj))
        .limit(1);

      if (!dirEntry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Firma nije pronadjena u direktorijumu' });
      }

      // Check not already claimed/onboarded
      if (dirEntry.bzrAgencijaId) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Ova firma je vec preuzeta od strane agencije' });
      }

      // Trigger enrichment (await both for onboarding)
      const [aprResult, cwResult] = await Promise.allSettled([
        enrichCompany(input.maticniBroj),
        enrichFromCompanyWall(input.maticniBroj),
      ]);

      // Re-fetch after enrichment to get updated data
      const [enrichedEntry] = await db
        .select()
        .from(companyDirectory)
        .where(eq(companyDirectory.maticniBroj, input.maticniBroj))
        .limit(1);

      const entry = enrichedEntry || dirEntry;

      // Get agency name
      const [agency] = await db
        .select({ name: agencies.name })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1);

      const agencyName = agency?.name || 'BZR Agencija';

      // Determine pricing tier
      const employeeCount = entry.brojZaposlenih || 1;
      const pricingTier = getPricingTier(employeeCount);

      // Create company record
      const [newCompany] = await db
        .insert(companies)
        .values({
          name: entry.poslovnoIme.trim(),
          pib: entry.maticniBroj, // PIB might not be available; use maticniBroj as fallback
          maticniBroj: entry.maticniBroj,
          activityCode: entry.sifraDelatnosti || '0000',
          address: entry.adresa || entry.opstina || 'N/A',
          city: entry.grad || entry.opstina || null,
          phone: entry.telefon || null,
          email: entry.email || null,
          director: entry.kontaktOsoba || entry.imeVlasnika
            ? `${entry.imeVlasnika || ''} ${entry.prezimeVlasnika || ''}`.trim()
            : 'N/A',
          bzrResponsiblePerson: 'N/A',
          employeeCount,
          agencyId,
          assignedAgentId: ctx.agencyUserId || null,
          pricingTier,
          accountTier: 'trial',
          trialExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Update directory entry with agency relationship
      await db
        .update(companyDirectory)
        .set({
          bzrAgencijaId: agencyId,
          bzrAgencijaNaziv: agencyName,
          bzrSaradnja: 'active',
          updatedAt: new Date(),
        })
        .where(eq(companyDirectory.maticniBroj, input.maticniBroj));

      // Send notification email if requested and email exists
      if (input.sendNotification && entry.email) {
        sendOnboardingNotificationEmail({
          companyEmail: entry.email,
          agencyName,
          companyName: entry.poslovnoIme.trim(),
          maticniBroj: entry.maticniBroj,
        }).catch((err) => {
          console.error(`Onboarding notification email failed for ${entry.maticniBroj}:`, err);
        });
      }

      return {
        company: newCompany,
        directoryEntry: entry,
        enrichmentResults: {
          apr: aprResult.status === 'fulfilled' ? 'success' : 'failed',
          companyWall: cwResult.status === 'fulfilled' ? 'success' : 'failed',
        },
      };
    }),

  // ============================================
  // Email Nurture Sequence
  // ============================================

  /**
   * Process nurture email batch - sends next stage emails to eligible companies
   * Designed to be called daily by admin or cron job
   */
  processNurture: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.agencyId && !ctx.userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate dozvolu' });
    }

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    // Find eligible companies for nurture
    const eligible = await db
      .select({
        id: companyDirectory.id,
        maticniBroj: companyDirectory.maticniBroj,
        poslovnoIme: companyDirectory.poslovnoIme,
        email: companyDirectory.email,
        inviteToken: companyDirectory.inviteToken,
        nurtureStage: companyDirectory.nurtureStage,
        nurtureLastEmailAt: companyDirectory.nurtureLastEmailAt,
      })
      .from(companyDirectory)
      .where(and(
        eq(companyDirectory.nurtureOptedOut, false),
        isNotNull(companyDirectory.email),
        sql`${companyDirectory.nurtureStage} < 5`,
        sql`(${companyDirectory.nurtureLastEmailAt} IS NULL OR ${companyDirectory.nurtureLastEmailAt} <= ${threeDaysAgo})`,
      ))
      .limit(100);

    let processed = 0;
    const errors: string[] = [];

    for (const company of eligible) {
      if (!company.email) continue;

      const nextStage = (company.nurtureStage || 0) + 1;

      // Generate invite token if missing
      let token = company.inviteToken;
      if (!token) {
        token = randomBytes(32).toString('hex');
        await db
          .update(companyDirectory)
          .set({ inviteToken: token })
          .where(eq(companyDirectory.id, company.id));
      }

      try {
        await sendNurtureEmail({
          to: company.email,
          companyName: company.poslovnoIme,
          maticniBroj: company.maticniBroj,
          inviteToken: token,
          stage: nextStage,
        });

        await db
          .update(companyDirectory)
          .set({
            nurtureStage: nextStage,
            nurtureLastEmailAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(companyDirectory.id, company.id));

        processed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${company.poslovnoIme} (stage ${nextStage}): ${message}`);
      }
    }

    return { processed, errors };
  }),

  // ============================================
  // AI Content Generation
  // ============================================

  /**
   * Generate a professional company description using AI
   */
  generateDescription: companyOwnerProcedure
    .input(z.object({
      maticniBroj: z.string().min(1).max(8),
      language: z.enum(['sr-latin', 'sr-cyrillic']).default('sr-latin'),
    }))
    .mutation(async ({ input }) => {
      // Fetch company data
      const [company] = await db
        .select()
        .from(companyDirectory)
        .where(eq(companyDirectory.maticniBroj, input.maticniBroj))
        .limit(1);

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Firma nije pronadjena' });
      }

      const hasAIProviders =
        process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY;

      if (!hasAIProviders) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'AI nije konfigurisan na serveru' });
      }

      const languageNote = input.language === 'sr-cyrillic'
        ? 'na srpskom cirilicnom pismu'
        : 'na srpskom latinicnom pismu';

      const prompt = `Napisi profesionalni opis firme "${company.poslovnoIme}" iz ${company.opstina || 'Srbije'}. ` +
        `Delatnost: ${company.sifraDelatnosti || 'nepoznata'}. ` +
        `Broj zaposlenih: ${company.brojZaposlenih || 'nepoznat'}. ` +
        `Pravna forma: ${company.pravnaForma || 'nepoznata'}. ` +
        `Opis treba da bude 2-3 recenice, profesionalan i informativan, ${languageNote}. ` +
        `Ne koristi fraze poput "sa ponosom" ili "sa zadovoljstvom". Budi koncizan i faktualan.`;

      try {
        let generatedDescription = '';

        if (process.env.OPENAI_API_KEY) {
          const { default: OpenAI } = await import('openai');
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.7,
          });
          generatedDescription = completion.choices[0]?.message?.content?.trim() || '';
        } else if (process.env.ANTHROPIC_API_KEY) {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          });
          const textBlock = message.content.find((b: any) => b.type === 'text');
          generatedDescription = (textBlock as any)?.text?.trim() || '';
        } else if (process.env.DEEPSEEK_API_KEY) {
          const { default: OpenAI } = await import('openai');
          const deepseek = new OpenAI({
            apiKey: process.env.DEEPSEEK_API_KEY,
            baseURL: 'https://api.deepseek.com/v1',
          });
          const completion = await deepseek.chat.completions.create({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.7,
          });
          generatedDescription = completion.choices[0]?.message?.content?.trim() || '';
        }

        return { generatedDescription };
      } catch (error) {
        console.error('AI description generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Generisanje opisa nije uspelo. Pokusajte ponovo.',
        });
      }
    }),

  // ============================================
  // Company Posts: Blog, Offers, Gallery
  // ============================================

  /**
   * Public: List posts for a company profile
   */
  listPosts: publicProcedure
    .input(z.object({
      maticniBroj: z.string().min(1).max(8),
      type: z.enum(['blog', 'ponuda', 'galerija']).optional(),
    }))
    .query(async ({ input }) => {
      // Get company directory entry
      const [dirEntry] = await db
        .select({ id: companyDirectory.id })
        .from(companyDirectory)
        .where(eq(companyDirectory.maticniBroj, input.maticniBroj))
        .limit(1);

      if (!dirEntry) {
        return [];
      }

      const conditions = [
        eq(companyPosts.companyDirectoryId, dirEntry.id),
        eq(companyPosts.isPublished, true),
      ];

      if (input.type) {
        conditions.push(eq(companyPosts.type, input.type));
      }

      const posts = await db
        .select()
        .from(companyPosts)
        .where(and(...conditions))
        .orderBy(desc(companyPosts.sortOrder), desc(companyPosts.createdAt));

      return posts;
    }),

  /**
   * Protected: Create a post (company owner only)
   */
  createPost: companyOwnerProcedure
    .input(z.object({
      type: z.enum(['blog', 'ponuda', 'galerija']),
      title: z.string().max(500).optional(),
      content: z.string().max(10000).optional(),
      imageUrl: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.companyOwnerId;

      // Find directory entry claimed by this company
      const [dirEntry] = await db
        .select({ id: companyDirectory.id })
        .from(companyDirectory)
        .where(eq(companyDirectory.claimedByCompanyId, companyId))
        .limit(1);

      if (!dirEntry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Nemate preuzetu stranicu firme. Prvo preuzmite profil.',
        });
      }

      // Check monthly post limit (5 free per month)
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [monthlyCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(companyPosts)
        .where(and(
          eq(companyPosts.companyDirectoryId, dirEntry.id),
          gte(companyPosts.createdAt, startOfMonth),
        ));

      if ((monthlyCount?.count ?? 0) >= 5) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Dostigli ste mesecni limit od 5 objava. Pokusajte ponovo sledeceg meseca.',
        });
      }

      const [post] = await db
        .insert(companyPosts)
        .values({
          companyDirectoryId: dirEntry.id,
          type: input.type,
          title: input.title || null,
          content: input.content || null,
          imageUrl: input.imageUrl || null,
        })
        .returning();

      return post;
    }),

  /**
   * Protected: Update a post (company owner only)
   */
  updatePost: companyOwnerProcedure
    .input(z.object({
      postId: z.number(),
      title: z.string().max(500).optional(),
      content: z.string().max(10000).optional(),
      imageUrl: z.string().max(500).optional(),
      isPublished: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.companyOwnerId;

      // Verify ownership: post belongs to company's claimed directory entry
      const [dirEntry] = await db
        .select({ id: companyDirectory.id })
        .from(companyDirectory)
        .where(eq(companyDirectory.claimedByCompanyId, companyId))
        .limit(1);

      if (!dirEntry) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate preuzetu stranicu firme' });
      }

      // Verify post belongs to this directory entry
      const [existingPost] = await db
        .select({ id: companyPosts.id })
        .from(companyPosts)
        .where(and(
          eq(companyPosts.id, input.postId),
          eq(companyPosts.companyDirectoryId, dirEntry.id),
        ))
        .limit(1);

      if (!existingPost) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post nije pronadjen' });
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (input.title !== undefined) updateData.title = input.title;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
      if (input.isPublished !== undefined) updateData.isPublished = input.isPublished;
      if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

      const [updated] = await db
        .update(companyPosts)
        .set(updateData)
        .where(eq(companyPosts.id, input.postId))
        .returning();

      return updated;
    }),

  /**
   * Protected: Delete a post (company owner only)
   */
  deletePost: companyOwnerProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.companyOwnerId;

      // Verify ownership
      const [dirEntry] = await db
        .select({ id: companyDirectory.id })
        .from(companyDirectory)
        .where(eq(companyDirectory.claimedByCompanyId, companyId))
        .limit(1);

      if (!dirEntry) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate preuzetu stranicu firme' });
      }

      const [existingPost] = await db
        .select({ id: companyPosts.id })
        .from(companyPosts)
        .where(and(
          eq(companyPosts.id, input.postId),
          eq(companyPosts.companyDirectoryId, dirEntry.id),
        ))
        .limit(1);

      if (!existingPost) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post nije pronadjen' });
      }

      await db.delete(companyPosts).where(eq(companyPosts.id, input.postId));

      return { success: true };
    }),

  /**
   * Protected: List own posts (for dashboard management)
   */
  myPosts: companyOwnerProcedure
    .input(z.object({
      type: z.enum(['blog', 'ponuda', 'galerija']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const companyId = ctx.companyOwnerId;

      const [dirEntry] = await db
        .select({ id: companyDirectory.id })
        .from(companyDirectory)
        .where(eq(companyDirectory.claimedByCompanyId, companyId))
        .limit(1);

      if (!dirEntry) {
        return { posts: [], postsRemaining: 5 };
      }

      const conditions = [eq(companyPosts.companyDirectoryId, dirEntry.id)];

      if (input?.type) {
        conditions.push(eq(companyPosts.type, input.type));
      }

      const posts = await db
        .select()
        .from(companyPosts)
        .where(and(...conditions))
        .orderBy(desc(companyPosts.sortOrder), desc(companyPosts.createdAt));

      // Count posts this month for remaining limit
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [monthlyCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(companyPosts)
        .where(and(
          eq(companyPosts.companyDirectoryId, dirEntry.id),
          gte(companyPosts.createdAt, startOfMonth),
        ));

      const postsRemaining = Math.max(0, 5 - (monthlyCount?.count ?? 0));

      return { posts, postsRemaining };
    }),

  /**
   * AI Blog/Offer Content Generation
   * Generates professional content from a topic using AI (OpenAI → Anthropic → DeepSeek fallback)
   */
  generatePostContent: companyOwnerProcedure
    .input(z.object({
      topic: z.string().min(3).max(500),
      type: z.enum(['blog', 'ponuda']).default('blog'),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.companyOwnerId;

      const hasAIProviders =
        process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY;

      if (!hasAIProviders) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'AI nije konfigurisan na serveru' });
      }

      // Get company data for context
      const [company] = await db
        .select({ id: companies.id, name: companies.name, pib: companies.pib })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      const [dirEntry] = await db
        .select({
          id: companyDirectory.id,
          poslovnoIme: companyDirectory.poslovnoIme,
          sifraDelatnosti: companyDirectory.sifraDelatnosti,
          opstina: companyDirectory.opstina,
          kratakOpis: companyDirectory.kratakOpis,
        })
        .from(companyDirectory)
        .where(eq(companyDirectory.claimedByCompanyId, companyId))
        .limit(1);

      // Check monthly AI generation limit (5 per month)
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      if (dirEntry) {
        const [monthlyCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(companyPosts)
          .where(and(
            eq(companyPosts.companyDirectoryId, dirEntry.id),
            gte(companyPosts.createdAt, startOfMonth),
          ));

        if ((monthlyCount?.count ?? 0) >= 5) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Dostigli ste mesecni limit od 5 objava. Pokusajte ponovo sledeceg meseca.',
          });
        }
      }

      const companyName = dirEntry?.poslovnoIme || company?.name || 'Firma';
      const delatnost = dirEntry?.sifraDelatnosti || '';
      const opstina = dirEntry?.opstina || '';
      const kratakOpis = dirEntry?.kratakOpis || '';

      const contentPrompt = input.type === 'blog'
        ? `Napisi profesionalan blog post za firmu "${companyName}" iz ${opstina || 'Srbije'}.
           Delatnost firme: ${delatnost || 'razna'}.
           ${kratakOpis ? `O firmi: ${kratakOpis}` : ''}
           Tema blog posta: "${input.topic}"

           Blog post treba da bude:
           - Na srpskom latinicnom pismu
           - 3-5 pasusa, profesionalan i informativan
           - Koristan za citaoce i potencijalne klijente
           - Ne koristi fraze "sa ponosom" ili "sa zadovoljstvom"
           - Budi koncizan ali detaljan

           Vrati SAMO tekst blog posta, bez naslova (naslov ce se posebno generisati).`
        : `Napisi privlacnu ponudu za firmu "${companyName}" iz ${opstina || 'Srbije'}.
           Delatnost: ${delatnost || 'razna'}.
           Tema ponude: "${input.topic}"

           Ponuda treba da bude kratka (2-3 recenice), privlacna i profesionalna na srpskom latinicnom pismu.`;

      const titlePrompt = `Predlozi kratak, privlacan naslov za ${input.type === 'blog' ? 'blog post' : 'ponudu'} na temu "${input.topic}" za firmu "${companyName}". Samo naslov, bez navodnika.`;

      const maxTokensContent = input.type === 'blog' ? 1000 : 200;

      try {
        let generatedContent = '';
        let generatedTitle = '';

        if (process.env.OPENAI_API_KEY) {
          const { default: OpenAI } = await import('openai');
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

          const [contentRes, titleRes] = await Promise.all([
            openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: contentPrompt }],
              max_tokens: maxTokensContent,
              temperature: 0.7,
            }),
            openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: titlePrompt }],
              max_tokens: 50,
              temperature: 0.7,
            }),
          ]);

          generatedContent = contentRes.choices[0]?.message?.content?.trim() || '';
          generatedTitle = titleRes.choices[0]?.message?.content?.trim() || '';
        } else if (process.env.ANTHROPIC_API_KEY) {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

          const [contentRes, titleRes] = await Promise.all([
            anthropic.messages.create({
              model: 'claude-sonnet-4-5-20250929',
              max_tokens: maxTokensContent,
              messages: [{ role: 'user', content: contentPrompt }],
            }),
            anthropic.messages.create({
              model: 'claude-sonnet-4-5-20250929',
              max_tokens: 50,
              messages: [{ role: 'user', content: titlePrompt }],
            }),
          ]);

          const contentBlock = contentRes.content.find((b: any) => b.type === 'text');
          generatedContent = (contentBlock as any)?.text?.trim() || '';
          const titleBlock = titleRes.content.find((b: any) => b.type === 'text');
          generatedTitle = (titleBlock as any)?.text?.trim() || '';
        } else if (process.env.DEEPSEEK_API_KEY) {
          const { default: OpenAI } = await import('openai');
          const deepseek = new OpenAI({
            apiKey: process.env.DEEPSEEK_API_KEY,
            baseURL: 'https://api.deepseek.com/v1',
          });

          const [contentRes, titleRes] = await Promise.all([
            deepseek.chat.completions.create({
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: contentPrompt }],
              max_tokens: maxTokensContent,
              temperature: 0.7,
            }),
            deepseek.chat.completions.create({
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: titlePrompt }],
              max_tokens: 50,
              temperature: 0.7,
            }),
          ]);

          generatedContent = contentRes.choices[0]?.message?.content?.trim() || '';
          generatedTitle = titleRes.choices[0]?.message?.content?.trim() || '';
        }

        return {
          title: generatedTitle,
          content: generatedContent,
        };
      } catch (error) {
        console.error('AI post content generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Generisanje teksta nije uspelo. Pokusajte ponovo.',
        });
      }
    }),
});
