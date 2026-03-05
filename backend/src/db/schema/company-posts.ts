import { pgTable, serial, varchar, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';
import { companyDirectory } from './company-directory';

/**
 * Company Posts Table
 *
 * Blog posts, offers, and gallery images for company free presentations.
 * Each post belongs to a company_directory entry (via companyDirectoryId).
 */
export const companyPosts = pgTable('company_posts', {
  id: serial('id').primaryKey(),
  companyDirectoryId: integer('company_directory_id')
    .notNull()
    .references(() => companyDirectory.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(), // 'blog', 'ponuda', 'galerija'
  title: varchar('title', { length: 500 }),
  content: text('content'),
  imageUrl: varchar('image_url', { length: 500 }),
  isPublished: boolean('is_published').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  companyDirIdIdx: index('cp_company_dir_id_idx').on(table.companyDirectoryId),
  typeIdx: index('cp_type_idx').on(table.type),
}));

export type CompanyPost = typeof companyPosts.$inferSelect;
export type NewCompanyPost = typeof companyPosts.$inferInsert;
