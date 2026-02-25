import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc/builder';
import { db } from '../../db';
import { companyDirectory } from '../../db/schema/company-directory';
import { eq, ilike, and, sql, desc, isNull, isNotNull } from 'drizzle-orm';
import { enrichCompany } from '../../services/apr-enrichment.service';

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
        conditions.push(ilike(companyDirectory.poslovnoIme, `%${filters.search}%`));
      }
      if (filters.sifraDelatnosti) {
        conditions.push(eq(companyDirectory.sifraDelatnosti, filters.sifraDelatnosti));
      }
      if (filters.sifraOpstine) {
        conditions.push(eq(companyDirectory.sifraOpstine, filters.sifraOpstine));
      }
      if (filters.opstina) {
        conditions.push(ilike(companyDirectory.opstina, `%${filters.opstina}%`));
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
});
