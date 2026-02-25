import { pgTable, serial, varchar, text, timestamp, boolean, integer, pgEnum, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { companies } from './companies';

/**
 * Message sender type enum
 */
export const messageSenderTypeEnum = pgEnum('message_sender_type', ['agency', 'company']);

/**
 * Message Threads Table
 *
 * One thread per agency-company conversation pair.
 * Tracks unread counts and archival status for each side.
 */
export const messageThreads = pgTable('message_threads', {
  id: serial('id').primaryKey(),

  // Participants
  agencyId: integer('agency_id').references(() => agencies.id).notNull(),
  companyId: integer('company_id').references(() => companies.id).notNull(),

  // Thread metadata
  subject: varchar('subject', { length: 500 }).notNull(),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  lastMessagePreview: varchar('last_message_preview', { length: 200 }),

  // Unread tracking
  unreadByAgency: integer('unread_by_agency').default(0).notNull(),
  unreadByCompany: integer('unread_by_company').default(0).notNull(),

  // Archival
  isArchivedByAgency: boolean('is_archived_by_agency').default(false).notNull(),
  isArchivedByCompany: boolean('is_archived_by_company').default(false).notNull(),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  agencyIdIdx: index('mt_agency_id_idx').on(table.agencyId),
  companyIdIdx: index('mt_company_id_idx').on(table.companyId),
  lastMessageAtIdx: index('mt_last_message_at_idx').on(table.lastMessageAt),
}));

/**
 * Messages Table
 *
 * Individual messages within a thread.
 */
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),

  // Thread reference
  threadId: integer('thread_id').references(() => messageThreads.id, { onDelete: 'cascade' }).notNull(),

  // Sender info
  senderType: messageSenderTypeEnum('sender_type').notNull(),
  senderAgencyId: integer('sender_agency_id'),
  senderCompanyId: integer('sender_company_id'),
  senderName: varchar('sender_name', { length: 255 }).notNull(),

  // Content
  content: text('content').notNull(),

  // Read tracking
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at'),

  // Email notification
  emailSent: boolean('email_sent').default(false).notNull(),
  emailSentAt: timestamp('email_sent_at'),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  threadIdIdx: index('msg_thread_id_idx').on(table.threadId),
  createdAtIdx: index('msg_created_at_idx').on(table.createdAt),
}));

export type MessageThread = typeof messageThreads.$inferSelect;
export type NewMessageThread = typeof messageThreads.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
