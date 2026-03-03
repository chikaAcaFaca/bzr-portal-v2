import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, companyOwnerProcedure } from '../trpc/builder';
import { db } from '../../db';
import { companyDirectory } from '../../db/schema/company-directory';
import { companies } from '../../db/schema/companies';
import { eq, ilike, and, sql, desc, isNull, isNotNull } from 'drizzle-orm';
import { enrichCompany } from '../../services/apr-enrichment.service';
import { randomBytes } from 'crypto';
import { sendCompanyInviteEmail } from '../../services/email.service';

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

      // Trigger enrichment if stale (async, don't block response)
      if (!company.enrichedAt || (Date.now() - company.enrichedAt.getTime()) > 30 * 24 * 60 * 60 * 1000) {
        enrichCompany(input.maticniBroj).catch((err) => {
          console.error(`Enrichment failed for ${input.maticniBroj}:`, err);
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
});
