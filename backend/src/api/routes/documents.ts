/**
 * Documents tRPC Router (T060)
 *
 * Generates and uploads Serbian BZR compliance documents.
 *
 * Endpoints:
 * - documents.generate - Generate DOCX and upload to Blob Storage
 *
 * Flow:
 * 1. Load position with company and risks (with authorization)
 * 2. Generate DOCX using DocumentGenerator service
 * 3. Upload to Vercel Blob Storage
 * 4. Return signed download URL (24-hour expiration)
 * 5. Log business event for audit trail
 */

import { router, protectedProcedure } from '../trpc/router';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { companies } from '../../db/schema/companies';
import { users } from '../../db/schema/users';
import { workPositions } from '../../db/schema/work-positions';
import { riskAssessments } from '../../db/schema/risk-assessments';
import { hazardTypes } from '../../db/schema/hazards';
import { DocumentGenerator } from '../../services/DocumentGenerator';
import { BlobStorage } from '../../lib/blob-storage';
import { logBusinessEvent } from '../../lib/logger';
import { TRPCError } from '@trpc/server';
import { uploadedDocuments } from '../../db/schema/uploaded-documents';

// =============================================================================
// Documents Router
// =============================================================================

export const documentsRouter = router({
  /**
   * Generate risk assessment document
   *
   * Generates "Akt o proceni rizika" DOCX document for a specific work position.
   * Uploads to Vercel Blob Storage and returns download URL.
   *
   * Authorization: User must own the company
   * Trial Limits: Not enforced for document generation (can generate unlimited docs for existing positions)
   *
   * Input: { positionId: number }
   * Output: { url: string, filename: string, size: number, expiresIn: string }
   * Errors:
   * - NOT_FOUND: Position not found
   * - FORBIDDEN: User does not own the company
   * - INTERNAL_SERVER_ERROR: Document generation or upload failed
   *
   * @example
   * // Frontend usage:
   * const { mutate } = trpc.documents.generate.useMutation();
   * mutate({ positionId: 5 }, {
   *   onSuccess: (data) => {
   *     window.open(data.url, '_blank'); // Download DOCX
   *   }
   * });
   */
  generate: protectedProcedure
    .input(
      z.object({
        positionId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId!; // Guaranteed by protectedProcedure

      // 1. Load position with company (for authorization)
      const position = await db.query.workPositions.findFirst({
        where: eq(workPositions.id, input.positionId),
      });

      if (!position) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Радно место није пронађено.',
        });
      }

      // 2. Load company (for authorization and document data)
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, position.companyId),
      });

      if (!company) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Предузеће није пронађено.',
        });
      }

      // 3. Verify ownership
      if (company.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Немате дозволу за генерисање документа за ово предузеће.',
        });
      }

      // 4. Check if user is on demo/trial - BLOCK DOWNLOAD
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user && user.accountTier === 'trial') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Демо период не дозвољава преузимање докумената. Претплатите се да бисте преузели генерисане документе. Email: info@bzr-portal.com',
        });
      }

      // 4. Load risk assessments with hazard details
      const risks = await db
        .select({
          id: riskAssessments.id,
          positionId: riskAssessments.positionId,
          hazardId: riskAssessments.hazardId,
          ei: riskAssessments.ei,
          pi: riskAssessments.pi,
          fi: riskAssessments.fi,
          e: riskAssessments.e,
          p: riskAssessments.p,
          f: riskAssessments.f,
          correctiveMeasures: riskAssessments.correctiveMeasures,
          implementationDeadline: riskAssessments.deadline,
          responsiblePerson: riskAssessments.responsiblePerson,
          hazard: {
            code: hazardTypes.code,
            nameSr: hazardTypes.nameSr,
            category: hazardTypes.category,
          },
        })
        .from(riskAssessments)
        .innerJoin(hazardTypes, eq(riskAssessments.hazardId, hazardTypes.id))
        .where(eq(riskAssessments.positionId, input.positionId));

      // 5. Validate that position has risk assessments
      if (risks.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Радно место нема дефинисане процене ризика. Молимо прво додајте процене ризика.',
        });
      }

      // 6. Generate DOCX document
      let buffer: Buffer;
      try {
        buffer = await DocumentGenerator.generate({
          company,
          position,
          risks,
        });
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Грешка при генерисању документа: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      // 7. Upload to Blob Storage
      const filename = BlobStorage.generateFilename(company.id, position.id);
      let url: string;
      try {
        url = await BlobStorage.uploadDocument(buffer, filename);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Грешка при отпремању документа: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      // 8. Log business event for audit trail
      logBusinessEvent('document_generated', parseInt(userId), company.id, {
        positionId: input.positionId,
        filename,
        fileSize: buffer.length,
        riskCount: risks.length,
      });

      // 9. Return download URL
      return {
        url, // Signed URL: https://[...].blob.vercel-storage.com/akt-1-5-[...].docx
        filename, // "akt-1-5-1698765432.docx"
        size: buffer.length, // Bytes
        expiresIn: '24 hours', // Blob Storage expiration
        message: 'Документ успешно генерисан',
      };
    }),

  /**
   * Get uploaded document by ID
   *
   * Returns a single uploaded document with extraction status and results.
   *
   * Authorization: User must own the company that owns the document
   *
   * Output: Uploaded document details
   */
  getUploadedById: protectedProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId!;

      // Get document
      const doc = await db.query.uploadedDocuments.findFirst({
        where: eq(uploadedDocuments.id, input.documentId),
      });

      if (!doc) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Документ није пронађен.',
        });
      }

      // Verify ownership via company
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, doc.companyId),
      });

      if (!company || company.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Немате дозволу за приступ овом документу.',
        });
      }

      return {
        id: doc.id,
        filename: doc.originalFilename,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        uploadedAt: doc.uploadedAt,
        processingStatus: doc.processingStatus,
        processingError: doc.processingError,
        extractedData: doc.extractedData,
        processedAt: doc.processedAt,
      };
    }),

  /**
   * Reset stuck document processing
   *
   * Resets a document's processing status from 'processing' to 'pending' or 'failed'.
   * Useful when AI extraction gets stuck.
   *
   * Authorization: User must own the company that owns the document
   */
  resetProcessing: protectedProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId!;

      // Get document
      const doc = await db.query.uploadedDocuments.findFirst({
        where: eq(uploadedDocuments.id, input.documentId),
      });

      if (!doc) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Документ није пронађен.',
        });
      }

      // Verify ownership via company
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, doc.companyId),
      });

      if (!company || company.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Немате дозволу за ресетовање овог документа.',
        });
      }

      // Reset to failed status to stop infinite processing
      await db
        .update(uploadedDocuments)
        .set({
          processingStatus: 'failed',
          processingError: 'Обрада ресетована од стране корисника',
        })
        .where(eq(uploadedDocuments.id, input.documentId));

      return {
        success: true,
        message: 'Обрада документа је ресетована',
      };
    }),

  /**
   * List uploaded documents for current user's company
   *
   * Returns list of user-uploaded documents with extraction status.
   *
   * Authorization: User must own the company
   *
   * Output: Array of uploaded documents
   */
  listUploaded: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId!;

    // Get user's company
    const userCompanies = await db
      .select()
      .from(companies)
      .where(eq(companies.userId, userId));

    if (userCompanies.length === 0) {
      return [];
    }

    const companyId = userCompanies[0]!.id;

    // Get uploaded documents for this company
    const documents = await db
      .select()
      .from(uploadedDocuments)
      .where(
        and(
          eq(uploadedDocuments.companyId, companyId),
          eq(uploadedDocuments.isDeleted, false)
        )
      )
      .orderBy(uploadedDocuments.uploadedAt);

    return documents.map((doc) => ({
      id: doc.id,
      filename: doc.originalFilename,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      uploadedAt: doc.uploadedAt,
      processingStatus: doc.processingStatus,
      processingError: doc.processingError,
      extractedData: doc.extractedData,
      addedToKnowledgeBase: doc.addedToKnowledgeBase,
    }));
  }),
});
