import { pgTable, serial, varchar, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Site Settings Table
 *
 * Key-value store for platform-wide configuration.
 * Used for default social media links, branding, and other admin-configurable settings.
 */
export const siteSettings = pgTable('site_settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type NewSiteSetting = typeof siteSettings.$inferInsert;
