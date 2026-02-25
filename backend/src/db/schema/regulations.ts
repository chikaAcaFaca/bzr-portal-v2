import { pgTable, serial, varchar, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

/**
 * Regulations Table
 *
 * Complete knowledge base of all BZR/ZOP regulations from minrzs.gov.rs.
 * Used by AI Agent to provide accurate answers about Serbian occupational safety law.
 * Contains 43+ pravilnici, 10+ uredbe, and 5+ zakoni.
 */
export const regulations = pgTable('regulations', {
  id: serial('id').primaryKey(),

  // Identification
  code: varchar('code', { length: 100 }), // e.g., "Sl.gl. RS 35/2023"
  title: varchar('title', { length: 500 }).notNull(),
  titleLatin: varchar('title_latin', { length: 500 }), // Latin transliteration

  // Classification
  type: varchar('type', { length: 50 }).notNull(), // 'zakon' | 'uredba' | 'pravilnik' | 'uputstvo'
  category: varchar('category', { length: 100 }), // 'bzr' | 'zop' | 'rad' | 'zdravlje'

  // Content
  summary: text('summary'), // AI-generated summary
  fullText: text('full_text'), // Full text of regulation (if available)
  sourceUrl: varchar('source_url', { length: 1000 }),
  pdfUrl: varchar('pdf_url', { length: 1000 }),

  // Dates
  adoptedDate: timestamp('adopted_date'), // Date regulation was adopted
  effectiveDate: timestamp('effective_date'), // Date it becomes effective
  amendedDate: timestamp('amended_date'), // Last amendment date

  // Status
  isActive: boolean('is_active').default(true).notNull(), // false if superseded
  supersededById: integer('superseded_by_id'), // Points to newer version

  // SEO (for /propisi pages)
  slug: varchar('slug', { length: 500 }).notNull().unique(),
  metaTitle: varchar('meta_title', { length: 160 }),
  metaDescription: varchar('meta_description', { length: 320 }),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Regulation = typeof regulations.$inferSelect;
export type NewRegulation = typeof regulations.$inferInsert;
