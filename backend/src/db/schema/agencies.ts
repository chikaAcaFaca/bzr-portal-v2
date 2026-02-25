import { pgTable, serial, varchar, text, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';

/**
 * Agency Subscription Status Enum
 */
export const agencySubscriptionStatusEnum = pgEnum('agency_subscription_status', [
  'trial',
  'active',
  'past_due',
  'cancelled',
  'expired',
]);

/**
 * Agencies Table
 *
 * BZR agencies that manage safety compliance for multiple client companies.
 * Each agency has a Paddle subscription (599 RSD/month) and can have multiple agents.
 */
export const agencies = pgTable('agencies', {
  id: serial('id').primaryKey(),

  // Agency identification
  name: varchar('name', { length: 255 }).notNull(),
  pib: varchar('pib', { length: 9 }).notNull().unique(), // Serbian tax ID
  maticniBroj: varchar('maticni_broj', { length: 8 }),
  licenseNumber: varchar('license_number', { length: 100 }), // BZR license number

  // Contact information
  address: varchar('address', { length: 500 }).notNull(),
  city: varchar('city', { length: 100 }),
  postalCode: varchar('postal_code', { length: 10 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }).notNull(),
  website: varchar('website', { length: 255 }),

  // Responsible person
  directorName: varchar('director_name', { length: 255 }).notNull(),

  // Paddle billing
  paddleCustomerId: varchar('paddle_customer_id', { length: 100 }),
  paddleSubscriptionId: varchar('paddle_subscription_id', { length: 100 }),
  subscriptionStatus: agencySubscriptionStatusEnum('subscription_status').default('trial').notNull(),
  trialEndsAt: timestamp('trial_ends_at'),
  currentPeriodEndsAt: timestamp('current_period_ends_at'),

  // Branding (optional future feature)
  logoUrl: varchar('logo_url', { length: 500 }),

  // Marketplace profile
  description: text('description'),
  specializations: text('specializations'),
  rating: varchar('rating', { length: 10 }),
  reviewCount: integer('review_count').default(0),
  isPublicOnMarketplace: boolean('is_public_on_marketplace').default(true),
  coverageArea: text('coverage_area'),

  // Audit fields
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Agency = typeof agencies.$inferSelect;
export type NewAgency = typeof agencies.$inferInsert;
