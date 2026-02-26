/**
 * Shared Enums
 *
 * Extracted to avoid circular dependencies between companies.ts and subscriptions.ts.
 */

import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Pricing Tier Enum - based on employee count (B2B2C marketplace model)
 */
export const pricingTierEnum = pgEnum('pricing_tier', [
  'agency',
  'tier_1',
  'tier_5',
  'tier_10',
  'tier_20',
  'tier_50',
  'tier_50plus',
]);

/**
 * Billing Cycle Enum
 */
export const billingCycleEnum = pgEnum('billing_cycle', ['monthly', 'annual']);

/**
 * Subscription Status Enum
 */
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'cancelled',
  'paused',
  'trialing',
]);
