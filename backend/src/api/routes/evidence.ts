/**
 * Evidence tRPC Router
 *
 * Endpoints for managing BZR evidence records (Obrazac 1-11)
 * and legal obligation tracking/notifications.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc/builder';
import { evidenceService } from '../../services/evidence.service';
import { obligationDetectorService } from '../../services/obligation-detector.service';
import { deadlineNotificationService } from '../../services/deadline-notification.service';
import { db } from '../../db';
import { legalObligations } from '../../db/schema/evidence-records';
import { eq, and, sql, desc } from 'drizzle-orm';

export const evidenceRouter = router({
  /**
   * Get evidence overview stats for a company
   */
  overview: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return evidenceService.getCompanyEvidenceOverview(input.companyId);
    }),

  /**
   * List records for a specific obrazac
   */
  listByObrazac: protectedProcedure
    .input(z.object({
      obrazac: z.number().min(1).max(11),
      companyId: z.number(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      return evidenceService.listByObrazac(input.obrazac, input.companyId, input.page, input.limit);
    }),

  /**
   * Get a single record by ID and obrazac type
   */
  getRecord: protectedProcedure
    .input(z.object({
      obrazac: z.number().min(1).max(11),
      id: z.number(),
    }))
    .query(async ({ input }) => {
      const record = await evidenceService.getRecord(input.obrazac, input.id);
      if (!record) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Zapis nije pronadjen' });
      }
      return record;
    }),

  /**
   * Create a record for a specific obrazac
   */
  createRecord: protectedProcedure
    .input(z.object({
      obrazac: z.number().min(1).max(11),
      data: z.record(z.unknown()),
    }))
    .mutation(async ({ input }) => {
      return evidenceService.createRecord(input.obrazac, input.data);
    }),

  /**
   * Update an existing record
   */
  updateRecord: protectedProcedure
    .input(z.object({
      obrazac: z.number().min(1).max(11),
      id: z.number(),
      data: z.record(z.unknown()),
    }))
    .mutation(async ({ input }) => {
      return evidenceService.updateRecord(input.obrazac, input.id, input.data);
    }),

  /**
   * Soft delete a record
   */
  deleteRecord: protectedProcedure
    .input(z.object({
      obrazac: z.number().min(1).max(11),
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      return evidenceService.deleteRecord(input.obrazac, input.id);
    }),

  /**
   * Auto-populate from existing data
   */
  autoPopulate: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      agencyId: z.number(),
      obrazac: z.number(), // 1, 2, or 11
    }))
    .mutation(async ({ input }) => {
      switch (input.obrazac) {
        case 1:
          return evidenceService.autoPopulateFromRiskAssessment(input.companyId, input.agencyId);
        case 2:
          return evidenceService.autoPopulateHighRiskWorkers(input.companyId, input.agencyId);
        case 11:
          return evidenceService.autoPopulateFromPpe(input.companyId, input.agencyId);
        default:
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Auto-popunjavanje nije dostupno za Obrazac ${input.obrazac}` });
      }
    }),

  /**
   * Get retention info for an obrazac
   */
  retentionInfo: protectedProcedure
    .input(z.object({ obrazac: z.number().min(1).max(11) }))
    .query(async ({ input }) => {
      return evidenceService.getRetentionInfo(input.obrazac);
    }),

  // ────────────────────────────────────────────────────────────────────────
  // Legal Obligations
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Get upcoming obligations (next 90 days)
   */
  obligationsUpcoming: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      agencyId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const conditions = [
        eq(legalObligations.status, 'aktivan'),
        sql`${legalObligations.rokDatum} >= CURRENT_DATE`,
        sql`${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '90 days'`,
      ];

      if (input.companyId) {
        conditions.push(eq(legalObligations.companyId, input.companyId));
      }
      if (input.agencyId) {
        conditions.push(eq(legalObligations.agencyId, input.agencyId));
      }

      return db
        .select()
        .from(legalObligations)
        .where(and(...conditions))
        .orderBy(legalObligations.rokDatum);
    }),

  /**
   * Get overdue obligations
   */
  obligationsOverdue: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      agencyId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const conditions = [
        sql`${legalObligations.rokDatum} < CURRENT_DATE`,
        sql`${legalObligations.status} IN ('aktivan', 'istekao')`,
      ];

      if (input.companyId) {
        conditions.push(eq(legalObligations.companyId, input.companyId));
      }
      if (input.agencyId) {
        conditions.push(eq(legalObligations.agencyId, input.agencyId));
      }

      return db
        .select()
        .from(legalObligations)
        .where(and(...conditions))
        .orderBy(legalObligations.rokDatum);
    }),

  /**
   * Sync obligations for a company (trigger detection)
   */
  obligationsSync: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      agencyId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return obligationDetectorService.syncAllObligations(input.companyId, input.agencyId);
    }),

  /**
   * Mark an obligation as completed
   */
  obligationMarkComplete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [obligation] = await db
        .update(legalObligations)
        .set({ status: 'zavrsen', updatedAt: new Date() })
        .where(eq(legalObligations.id, input.id))
        .returning();

      return obligation;
    }),

  /**
   * Trigger notification check (admin/cron)
   */
  sendNotifications: protectedProcedure
    .mutation(async () => {
      return deadlineNotificationService.checkAndSendNotifications();
    }),
});
