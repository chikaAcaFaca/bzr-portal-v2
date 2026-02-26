/**
 * Injury Reports tRPC Router
 *
 * Full injury report management with AI ESAW coding.
 * Distribution tracking for 5-copy system.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc/builder';
import { db } from '../../db';
import { injuryReports, injuryReportDistribution } from '../../db/schema/injury-reports';
import { companies } from '../../db/schema/companies';
import { injuryCodingService } from '../../services/injury-coding.service';
import { eq, and, desc, sql } from 'drizzle-orm';

export const injuryReportsRouter = router({
  /**
   * Create a new injury report
   */
  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      agencyId: z.number(),
      data: z.record(z.unknown()),
    }))
    .mutation(async ({ input }) => {
      // Auto-fill employer data from company profile
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);

      const reportData = {
        ...input.data,
        companyId: input.companyId,
        agencyId: input.agencyId,
        poslodavacNaziv: company?.name,
        poslodavacPib: company?.pib,
        poslodavacMaticniBroj: company?.maticniBroj,
        poslodavacAdresa: company?.address,
        poslodavacMesto: company?.city,
        poslodavacTelefon: company?.phone,
      };

      const [report] = await db
        .insert(injuryReports)
        .values(reportData as any)
        .returning();

      // Create distribution records for 5 recipients
      const recipients = ['povredjeni', 'poslodavac', 'inspekcija_rada', 'rfzo', 'sindikat'];
      for (const primalac of recipients) {
        await db.insert(injuryReportDistribution).values({
          injuryReportId: report.id,
          primalac,
        });
      }

      return report;
    }),

  /**
   * Update an injury report
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.record(z.unknown()),
    }))
    .mutation(async ({ input }) => {
      const [report] = await db
        .update(injuryReports)
        .set({ ...input.data, updatedAt: new Date() } as any)
        .where(eq(injuryReports.id, input.id))
        .returning();

      return report;
    }),

  /**
   * Get a full injury report with ESAW codes
   */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [report] = await db
        .select()
        .from(injuryReports)
        .where(eq(injuryReports.id, input.id))
        .limit(1);

      if (!report) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Izvestaj nije pronadjen' });
      }

      // Get distribution records
      const distribution = await db
        .select()
        .from(injuryReportDistribution)
        .where(eq(injuryReportDistribution.injuryReportId, input.id))
        .orderBy(injuryReportDistribution.primalac);

      return { ...report, distribution };
    }),

  /**
   * List injury reports per company
   */
  list: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      agencyId: z.number().optional(),
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const conditions: any[] = [];

      if (input.companyId) conditions.push(eq(injuryReports.companyId, input.companyId));
      if (input.agencyId) conditions.push(eq(injuryReports.agencyId, input.agencyId));
      if (input.status) conditions.push(eq(injuryReports.status, input.status));

      const offset = (input.page - 1) * input.limit;

      const reports = await db
        .select({
          id: injuryReports.id,
          imeIPrezime: injuryReports.imeIPrezime,
          datumPovrede: injuryReports.datumPovrede,
          tezinaPovrede: injuryReports.tezinaPovrede,
          radnoMesto: injuryReports.radnoMesto,
          status: injuryReports.status,
          companyId: injuryReports.companyId,
          createdAt: injuryReports.createdAt,
          companyName: companies.name,
        })
        .from(injuryReports)
        .leftJoin(companies, eq(injuryReports.companyId, companies.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(injuryReports.datumPovrede))
        .limit(input.limit)
        .offset(offset);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(injuryReports)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return {
        reports,
        total: countResult?.count ?? 0,
        page: input.page,
        limit: input.limit,
      };
    }),

  /**
   * AI ESAW coding - send description, get codes back
   */
  codeWithAi: protectedProcedure
    .input(z.object({ description: z.string().min(10) }))
    .mutation(async ({ input }) => {
      return injuryCodingService.codeInjuryDescription(input.description);
    }),

  /**
   * Get ESAW classification options for a table
   */
  getEsawTable: protectedProcedure
    .input(z.object({ tabelaBroj: z.number().min(1).max(19) }))
    .query(async ({ input }) => {
      return injuryCodingService.getEsawOptions(input.tabelaBroj);
    }),

  /**
   * Get all ESAW tables summary
   */
  getEsawTablesSummary: protectedProcedure
    .query(async () => {
      return injuryCodingService.getEsawTablesSummary();
    }),

  /**
   * Record distribution of a copy
   */
  distribute: protectedProcedure
    .input(z.object({
      injuryReportId: z.number(),
      primalac: z.string(),
      datumSlanja: z.string().optional(),
      datumPrijema: z.string().optional(),
      napomena: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Update existing distribution record
      const [existing] = await db
        .select()
        .from(injuryReportDistribution)
        .where(
          and(
            eq(injuryReportDistribution.injuryReportId, input.injuryReportId),
            eq(injuryReportDistribution.primalac, input.primalac)
          )
        )
        .limit(1);

      if (existing) {
        const updates: Record<string, unknown> = {};
        if (input.datumSlanja) updates.datumSlanja = input.datumSlanja;
        if (input.datumPrijema) updates.datumPrijema = input.datumPrijema;
        if (input.napomena) updates.napomena = input.napomena;

        const [updated] = await db
          .update(injuryReportDistribution)
          .set(updates as any)
          .where(eq(injuryReportDistribution.id, existing.id))
          .returning();

        return updated;
      }

      // Create new distribution record
      const [record] = await db
        .insert(injuryReportDistribution)
        .values({
          injuryReportId: input.injuryReportId,
          primalac: input.primalac,
          datumSlanja: input.datumSlanja || null,
          datumPrijema: input.datumPrijema || null,
          napomena: input.napomena || null,
        })
        .returning();

      return record;
    }),
});
