/**
 * Newsletter Schema
 *
 * Manages newsletter subscribers and campaigns.
 * Emails sent via Resend batch API.
 */

import { pgTable, serial, integer, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// ──────────────────────────────────────────────────────────────────────────────
// Newsletter Subscribers
// ──────────────────────────────────────────────────────────────────────────────
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  ime: varchar('ime', { length: 255 }),
  tip: varchar('tip', { length: 50 }), // 'agencija', 'firma', 'neregistrovan'
  userId: integer('user_id'), // nullable - linked if registered
  subscribedAt: timestamp('subscribed_at').defaultNow().notNull(),
  unsubscribedAt: timestamp('unsubscribed_at'),
  unsubscribeToken: varchar('unsubscribe_token', { length: 100 }),
  isActive: boolean('is_active').default(true),
});

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type NewNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Newsletter Campaigns
// ──────────────────────────────────────────────────────────────────────────────
export const newsletterCampaigns = pgTable('newsletter_campaigns', {
  id: serial('id').primaryKey(),
  naslov: varchar('naslov', { length: 500 }).notNull(),
  sadrzaj: text('sadrzaj').notNull(), // HTML content
  tipPrimaoca: varchar('tip_primaoca', { length: 50 }), // 'svi', 'agencija', 'firma', 'neregistrovan'
  status: varchar('status', { length: 50 }).default('draft'), // draft/scheduled/sent
  scheduledAt: timestamp('scheduled_at'),
  sentAt: timestamp('sent_at'),
  ukupnoPoslato: integer('ukupno_poslato').default(0),
  ukupnoOtvoreno: integer('ukupno_otvoreno').default(0),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type NewsletterCampaign = typeof newsletterCampaigns.$inferSelect;
export type NewNewsletterCampaign = typeof newsletterCampaigns.$inferInsert;
