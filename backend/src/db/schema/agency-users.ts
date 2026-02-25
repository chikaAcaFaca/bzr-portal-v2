import { pgTable, serial, varchar, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

/**
 * Agency User Role Enum
 */
export const agencyUserRoleEnum = pgEnum('agency_user_role', [
  'owner',  // Agency owner - can manage billing, agents, all clients
  'agent',  // BZR agent - can manage assigned clients
]);

/**
 * Agency Users Table
 *
 * Individual agents/employees working for a BZR agency.
 * Each agent has their own Firebase Auth account and can manage assigned clients.
 * Example: Agency "SafeWork" has 5 agents, each managing ~250 clients.
 */
export const agencyUsers = pgTable('agency_users', {
  id: serial('id').primaryKey(),

  // Relationship
  agencyId: integer('agency_id').notNull().references(() => agencies.id),

  // Firebase Auth
  firebaseUid: varchar('firebase_uid', { length: 128 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),

  // Profile
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),

  // Role
  role: agencyUserRoleEnum('role').default('agent').notNull(),

  // Status
  isActive: boolean('is_active').default(true).notNull(),

  // Audit fields
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
});

export type AgencyUser = typeof agencyUsers.$inferSelect;
export type NewAgencyUser = typeof agencyUsers.$inferInsert;
