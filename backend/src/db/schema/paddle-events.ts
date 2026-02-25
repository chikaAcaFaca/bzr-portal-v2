import { pgTable, serial, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { companies } from './companies';

/**
 * Paddle Events Table
 *
 * Audit log of all Paddle webhook events for debugging and reconciliation.
 * Every webhook from Paddle is stored here before processing.
 */
export const paddleEvents = pgTable('paddle_events', {
  id: serial('id').primaryKey(),

  // Paddle event identification
  paddleEventId: varchar('paddle_event_id', { length: 100 }).notNull().unique(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  // e.g.: subscription.created, subscription.updated, subscription.cancelled,
  //       transaction.completed, transaction.payment_failed

  // Related entities (nullable - resolved during processing)
  agencyId: integer('agency_id').references(() => agencies.id),
  companyId: integer('company_id').references(() => companies.id),

  // Raw payload from Paddle
  payload: jsonb('payload').notNull(),

  // Processing status
  processedAt: timestamp('processed_at'),
  processingError: text('processing_error'),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type PaddleEvent = typeof paddleEvents.$inferSelect;
export type NewPaddleEvent = typeof paddleEvents.$inferInsert;
