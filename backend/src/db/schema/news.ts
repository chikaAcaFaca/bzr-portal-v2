import { pgTable, serial, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';

/**
 * News Table
 *
 * Stores news articles scraped from minrzs.gov.rs related to BZR and ZOP.
 * Daily monitoring CRON job checks for new content and uses AI to analyze relevance.
 */
export const news = pgTable('news', {
  id: serial('id').primaryKey(),

  // Content
  title: varchar('title', { length: 500 }).notNull(),
  slug: varchar('slug', { length: 500 }).notNull().unique(),
  summary: text('summary').notNull(), // AI-generated summary
  content: text('content'), // Full article text
  sourceUrl: varchar('source_url', { length: 1000 }).notNull(),

  // Categorization
  category: varchar('category', { length: 50 }).notNull(), // 'bzr' | 'zop' | 'zakon' | 'pravilnik' | 'vest'
  tags: text('tags'), // Comma-separated tags

  // Publishing
  isPublished: boolean('is_published').default(true).notNull(),
  publishedAt: timestamp('published_at').defaultNow().notNull(),

  // SEO
  metaTitle: varchar('meta_title', { length: 160 }),
  metaDescription: varchar('meta_description', { length: 320 }),

  // Source tracking
  sourcePublishedAt: timestamp('source_published_at'), // When minrzs.gov.rs published it
  scrapedAt: timestamp('scraped_at').defaultNow().notNull(),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type News = typeof news.$inferSelect;
export type NewNews = typeof news.$inferInsert;
