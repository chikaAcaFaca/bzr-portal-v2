/**
 * Document Workflow tRPC Router
 *
 * Client document upload and AI document generation workflow.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc/builder';
import { clientUploadService } from '../../services/client-upload.service';
import { documentWorkflowService } from '../../services/document-workflow.service';

export const documentWorkflowRouter = router({
  /**
   * List uploaded documents for a company
   */
  listDocuments: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tip: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return clientUploadService.listDocuments(input.companyId, input.tip);
    }),

  /**
   * Get a single uploaded document
   */
  getDocument: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const doc = await clientUploadService.getDocument(input.id);
      if (!doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dokument nije pronadjen' });
      }
      return doc;
    }),

  /**
   * Register a document after S3 upload
   */
  createDocument: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      agencyId: z.number().optional(),
      naziv: z.string().min(1),
      tip: z.string().min(1),
      opis: z.string().optional(),
      fileKey: z.string().min(1),
      fileName: z.string().min(1),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      workerId: z.number().optional(),
      positionId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return clientUploadService.createDocument({
        companyId: input.companyId,
        agencyId: input.agencyId,
        naziv: input.naziv,
        tip: input.tip,
        opis: input.opis,
        fileKey: input.fileKey,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        workerId: input.workerId,
        positionId: input.positionId,
      });
    }),

  /**
   * Process document with AI
   */
  processWithAI: protectedProcedure
    .input(z.object({
      documentId: z.number(),
      extractedText: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return clientUploadService.processWithAI(input.documentId, input.extractedText);
    }),

  /**
   * Link document to worker or position
   */
  linkDocument: protectedProcedure
    .input(z.object({
      documentId: z.number(),
      workerId: z.number().optional(),
      positionId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return clientUploadService.linkDocument(input.documentId, input.workerId, input.positionId);
    }),

  // ────────────────────────────────────────────────────────────────────────
  // Document Generation Workflows
  // ────────────────────────────────────────────────────────────────────────

  /**
   * List all workflows for a company
   */
  listWorkflows: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return documentWorkflowService.listWorkflows(input.companyId);
    }),

  /**
   * Get a single workflow
   */
  getWorkflow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const workflow = await documentWorkflowService.getWorkflow(input.id);
      if (!workflow) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tok dokumenta nije pronadjen' });
      }
      return workflow;
    }),

  /**
   * Create a new document workflow
   */
  createWorkflow: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      agencyId: z.number().optional(),
      tipDokumenta: z.string().min(1),
      naziv: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return documentWorkflowService.createWorkflow({
        companyId: input.companyId,
        agencyId: input.agencyId,
        tipDokumenta: input.tipDokumenta,
        naziv: input.naziv,
      });
    }),

  /**
   * Check company readiness for a document type
   */
  analyzeReadiness: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tipDokumenta: z.string().min(1),
    }))
    .query(async ({ input }) => {
      return documentWorkflowService.analyzeCompanyReadiness(input.companyId, input.tipDokumenta);
    }),

  /**
   * Re-analyze workflow after data upload
   */
  reanalyzeWorkflow: protectedProcedure
    .input(z.object({ workflowId: z.number() }))
    .mutation(async ({ input }) => {
      return documentWorkflowService.reanalyzeWorkflow(input.workflowId);
    }),

  /**
   * Mark workflow document as signed
   */
  markSigned: protectedProcedure
    .input(z.object({
      workflowId: z.number(),
      potpisaoIme: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return documentWorkflowService.markSigned(input.workflowId, input.potpisaoIme);
    }),
});
