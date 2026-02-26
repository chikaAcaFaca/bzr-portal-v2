import { pgTable, serial, varchar, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { accountTierEnum } from './users';
import { agencies } from './agencies';
import { agencyUsers } from './agency-users';
import { pricingTierEnum, billingCycleEnum } from './enums';

/**
 * Companies Table
 *
 * Client companies (klijenti) managed by BZR agencies.
 * Each company belongs to an agency and is assigned to an agent.
 * Pricing is based on employee count (1,990 - 19,990 RSD/month).
 */
export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'), // Legacy: old user-based ownership (nullable for migration)

  // Multi-tenant: Agency relationship
  agencyId: integer('agency_id').references(() => agencies.id), // Which agency manages this client
  assignedAgentId: integer('assigned_agent_id').references(() => agencyUsers.id), // Which agent is responsible

  // Company identification (FR-001)
  name: varchar('name', { length: 255 }).notNull(),
  pib: varchar('pib', { length: 9 }).notNull(), // Serbian tax ID (9 digits, modulo-11 checksum)
  maticniBroj: varchar('maticni_broj', { length: 8 }), // Company registration number
  activityCode: varchar('activity_code', { length: 4 }).notNull(), // 4-digit šifra delatnosti
  activityDescription: text('activity_description'),

  // Contact information
  address: varchar('address', { length: 500 }).notNull(),
  city: varchar('city', { length: 100 }),
  postalCode: varchar('postal_code', { length: 10 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),

  // Responsible persons
  director: varchar('director', { length: 255 }).notNull(),
  directorJmbg: varchar('director_jmbg', { length: 255 }), // Encrypted JMBG (AES-256-GCM)
  bzrResponsiblePerson: varchar('bzr_responsible_person', { length: 255 }).notNull(),
  bzrResponsibleJmbg: varchar('bzr_responsible_jmbg', { length: 255 }), // Encrypted JMBG

  // Employee count and pricing
  employeeCount: integer('employee_count').default(0), // Actual number of employees
  organizationChart: text('organization_chart'), // URL or file path

  // Paddle billing (per-client subscription)
  pricingTier: pricingTierEnum('pricing_tier'), // Determined by employeeCount
  billingCycle: billingCycleEnum('billing_cycle').default('monthly'),
  paddleSubscriptionId: varchar('paddle_subscription_id', { length: 100 }),

  // Legacy trial fields (kept for backward compatibility during migration)
  accountTier: accountTierEnum('account_tier').default('trial').notNull(),
  trialExpiryDate: timestamp('trial_expiry_date'),
  documentGenerationCount: integer('document_generation_count').default(0).notNull(),
  workPositionCount: integer('work_position_count').default(0).notNull(),

  // Self-registration: Company owner (B2B2C marketplace)
  firebaseUid: varchar('firebase_uid', { length: 128 }).unique(),
  ownerEmail: varchar('owner_email', { length: 255 }),
  ownerFullName: varchar('owner_full_name', { length: 255 }),

  // Marketplace: Agency connection
  connectedAgencyId: integer('connected_agency_id').references(() => agencies.id),
  connectionStatus: varchar('connection_status', { length: 20 }).default('none'), // none/pending/connected/disconnected

  // IPS payment tracking
  subscriptionPaidUntil: timestamp('subscription_paid_until'),
  lastPaymentAt: timestamp('last_payment_at'),

  // Audit fields
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
