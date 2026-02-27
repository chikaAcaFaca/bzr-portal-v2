import { pgTable, serial, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { companies } from './companies';
import { pricingTierEnum, billingCycleEnum, subscriptionStatusEnum } from './enums';

// Re-export enums for backward compatibility
export { pricingTierEnum, billingCycleEnum, subscriptionStatusEnum };

/**
 * Subscriptions Table
 *
 * Tracks subscriptions for individual client companies.
 * Client subscription: 990 - 14,990 RSD/month based on employee count
 */
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),

  // Owner - either an agency or a company (client)
  agencyId: integer('agency_id').references(() => agencies.id),
  companyId: integer('company_id').references(() => companies.id),

  // Pricing
  pricingTier: pricingTierEnum('pricing_tier').notNull(),
  billingCycle: billingCycleEnum('billing_cycle').default('monthly').notNull(),
  priceAmountRsd: integer('price_amount_rsd').notNull(), // Price in RSD (e.g., 1990, 2490, etc.)

  // Status
  status: subscriptionStatusEnum('status').default('active').notNull(),

  // Period
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelledAt: timestamp('cancelled_at'),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

/**
 * Pricing Tiers Configuration (constant, not DB)
 * Used by billing logic to determine correct tier
 */
export const PRICING_TIERS = {
  agency: { maxEmployees: 0, monthlyRsd: 0, annualRsd: 0, label: 'Agencija (besplatno)' },
  tier_1: { maxEmployees: 1, monthlyRsd: 990, annualRsd: 9900, label: '1 zaposlen' },
  tier_5: { maxEmployees: 5, monthlyRsd: 1990, annualRsd: 19900, label: 'Do 5 zaposlenih' },
  tier_10: { maxEmployees: 10, monthlyRsd: 3990, annualRsd: 39900, label: 'Do 10 zaposlenih' },
  tier_20: { maxEmployees: 20, monthlyRsd: 6990, annualRsd: 69900, label: 'Do 20 zaposlenih' },
  tier_50: { maxEmployees: 50, monthlyRsd: 9990, annualRsd: 99900, label: 'Do 50 zaposlenih' },
  tier_50plus: { maxEmployees: Infinity, monthlyRsd: 14990, annualRsd: 149900, label: '51+ zaposlenih' },
} as const;

/**
 * Get the correct pricing tier for a given employee count
 */
export function getPricingTier(employeeCount: number): keyof typeof PRICING_TIERS {
  if (employeeCount <= 1) return 'tier_1';
  if (employeeCount <= 5) return 'tier_5';
  if (employeeCount <= 10) return 'tier_10';
  if (employeeCount <= 20) return 'tier_20';
  if (employeeCount <= 50) return 'tier_50';
  return 'tier_50plus';
}
