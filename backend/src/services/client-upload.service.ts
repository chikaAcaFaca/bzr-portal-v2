/**
 * Client Upload Service
 *
 * Handles document uploads from companies (contracts, decisions, sistematizacija, doznake).
 * Processes uploads through AI for data extraction.
 */

import { db } from '../db';
import { clientDocuments } from '../db/schema/client-documents';
import { eq, and, desc } from 'drizzle-orm';
import { getDeepSeek } from '../lib/ai/providers';

/**
 * Create a client document record after S3 upload
 */
export async function createDocument(data: {
  companyId: number;
  agencyId?: number;
  naziv: string;
  tip: string;
  opis?: string;
  fileKey: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  workerId?: number;
  positionId?: number;
}) {
  const [doc] = await db
    .insert(clientDocuments)
    .values({
      companyId: data.companyId,
      agencyId: data.agencyId || null,
      naziv: data.naziv,
      tip: data.tip,
      opis: data.opis || null,
      fileKey: data.fileKey,
      fileName: data.fileName,
      fileSize: data.fileSize || null,
      mimeType: data.mimeType || null,
      workerId: data.workerId || null,
      positionId: data.positionId || null,
    })
    .returning();

  return doc;
}

/**
 * Process document with AI to extract structured data
 * Uses DeepSeek for cost-effective extraction
 */
export async function processWithAI(documentId: number, extractedText: string) {
  const [doc] = await db
    .select()
    .from(clientDocuments)
    .where(eq(clientDocuments.id, documentId))
    .limit(1);

  if (!doc) throw new Error('Document not found');

  try {
    const deepseek = getDeepSeek();

    const systemPrompt = `Ti si AI asistent za obradu BZR (bezbednost i zdravlje na radu) dokumenata.
Analiziraj sledeci dokument i izvuci strukturirane podatke.

Tip dokumenta: ${doc.tip}

Vrati JSON objekat sa sledecim poljima (popuni samo ona koja pronadjes):
{
  "zaposleni": [{"ime": "", "jmbg": "", "radnoMesto": ""}],
  "radnaMesta": [{"naziv": "", "opis": "", "opasnosti": []}],
  "datumi": [{"tip": "", "datum": ""}],
  "mere": [{"tip": "", "opis": ""}],
  "ostalo": {}
}`;

    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: extractedText },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const extractedData = JSON.parse(response.choices[0]?.message?.content || '{}');

    await db
      .update(clientDocuments)
      .set({
        aiProcessed: true,
        aiExtractedData: extractedData,
        aiProcessedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientDocuments.id, documentId));

    return extractedData;
  } catch (error) {
    console.error(`AI processing failed for document ${documentId}:`, error);
    throw error;
  }
}

/**
 * List documents for a company
 */
export async function listDocuments(companyId: number, tip?: string) {
  const conditions = [eq(clientDocuments.companyId, companyId), eq(clientDocuments.isDeleted, false)];
  if (tip) {
    conditions.push(eq(clientDocuments.tip, tip));
  }

  return db
    .select()
    .from(clientDocuments)
    .where(and(...conditions))
    .orderBy(desc(clientDocuments.createdAt));
}

/**
 * Get a single document
 */
export async function getDocument(id: number) {
  const [doc] = await db
    .select()
    .from(clientDocuments)
    .where(and(eq(clientDocuments.id, id), eq(clientDocuments.isDeleted, false)))
    .limit(1);

  return doc || null;
}

/**
 * Link document to worker or position
 */
export async function linkDocument(documentId: number, workerId?: number, positionId?: number) {
  const [doc] = await db
    .update(clientDocuments)
    .set({
      workerId: workerId || null,
      positionId: positionId || null,
      updatedAt: new Date(),
    })
    .where(eq(clientDocuments.id, documentId))
    .returning();

  return doc;
}

export const clientUploadService = {
  createDocument,
  processWithAI,
  listDocuments,
  getDocument,
  linkDocument,
};
