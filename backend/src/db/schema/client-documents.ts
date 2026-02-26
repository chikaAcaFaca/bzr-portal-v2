/**
 * Client Documents & AI Document Workflow Schema
 *
 * Tracks documents uploaded by companies (contracts, decisions, sistematizacija, doznake).
 * AI (Botislav) processes uploaded data, identifies gaps, and generates BZR documents.
 */

import { pgTable, serial, integer, varchar, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { agencies } from './agencies';

// ──────────────────────────────────────────────────────────────────────────────
// Client Documents - uploaded by companies for AI processing
// ──────────────────────────────────────────────────────────────────────────────
export const clientDocuments = pgTable('client_documents', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .references(() => agencies.id),

  // Document metadata
  naziv: varchar('naziv', { length: 500 }).notNull(),
  tip: varchar('tip', { length: 100 }).notNull(),
  // 'ugovor_o_radu', 'odluka', 'resenje', 'sistematizacija', 'doznaka',
  // 'lekarski_nalaz', 'polisa_osiguranja', 'zapisnik', 'ostalo'
  opis: text('opis'),

  // Storage (Wasabi S3)
  fileKey: varchar('file_key', { length: 500 }).notNull(),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type', { length: 100 }),

  // Processing status (AI reads and extracts data)
  aiProcessed: boolean('ai_processed').default(false),
  aiExtractedData: jsonb('ai_extracted_data'), // structured data extracted by AI
  aiProcessedAt: timestamp('ai_processed_at'),

  // Linked worker/position (optional)
  workerId: integer('worker_id'),
  positionId: integer('position_id'),

  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ClientDocument = typeof clientDocuments.$inferSelect;
export type NewClientDocument = typeof clientDocuments.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Document Workflow - tracks what Botislav needs to produce
// ──────────────────────────────────────────────────────────────────────────────
export const documentWorkflow = pgTable('document_workflow', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .references(() => agencies.id),

  // What document needs to be generated
  tipDokumenta: varchar('tip_dokumenta', { length: 200 }).notNull(),
  // 'akt_o_proceni_rizika', 'obrazac_1', 'obrazac_2', ... 'izvestaj_o_povredi',
  // 'pravilnik_bzr', 'program_osposobljavanja', 'elaborat'
  naziv: varchar('naziv', { length: 500 }).notNull(),

  // Workflow status
  status: varchar('status', { length: 50 }).default('nedostaju_podaci'),
  // 'nedostaju_podaci' -> 'u_pripremi' -> 'generisan' -> 'potpisan'

  // What data is missing (AI fills this in)
  nedostajuciPodaci: jsonb('nedostajuci_podaci'), // [{field, opis, source}]

  // Generated document
  generisanFileKey: varchar('generisan_file_key', { length: 500 }),
  generisanAt: timestamp('generisan_at'),

  // Signature tracking
  potrebanPotpis: varchar('potreban_potpis', { length: 100 }),
  // 'agencija', 'licencirani_zaposleni', 'direktor'
  potpisaoIme: varchar('potpisao_ime', { length: 255 }),
  potpisanAt: timestamp('potpisan_at'),

  // AI conversation reference
  conversationId: integer('conversation_id'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type DocumentWorkflowRecord = typeof documentWorkflow.$inferSelect;
export type NewDocumentWorkflowRecord = typeof documentWorkflow.$inferInsert;
