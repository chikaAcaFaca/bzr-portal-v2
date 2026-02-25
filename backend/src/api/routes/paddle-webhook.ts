import { Hono } from 'hono';
import { db } from '../../db';
import { paddleEvents } from '../../db/schema/paddle-events';
import { agencies } from '../../db/schema/agencies';
import { subscriptions } from '../../db/schema/subscriptions';
import { companies } from '../../db/schema/companies';
import { eq } from 'drizzle-orm';

/**
 * Paddle Webhook Handler
 *
 * Receives webhook events from Paddle for subscription lifecycle management.
 * Events handled:
 * - subscription.created: New subscription started
 * - subscription.updated: Plan/quantity changed
 * - subscription.cancelled: Subscription cancelled
 * - transaction.completed: Payment successful
 * - transaction.payment_failed: Payment failed
 *
 * Paddle Webhook Signature verification uses PADDLE_WEBHOOK_SECRET.
 */

const paddleWebhook = new Hono();

/**
 * Verify Paddle webhook signature
 * In production, verify using Paddle's public key or webhook secret
 */
async function verifyPaddleSignature(body: string, signature: string | null): Promise<boolean> {
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('PADDLE_WEBHOOK_SECRET not set - skipping signature verification');
    return true; // Allow in development
  }

  if (!signature) {
    return false;
  }

  // Paddle Billing uses ts;h1 signature format
  // ts = timestamp, h1 = HMAC-SHA256 signature
  try {
    const parts = signature.split(';');
    const tsStr = parts.find((p) => p.startsWith('ts='))?.substring(3);
    const h1Str = parts.find((p) => p.startsWith('h1='))?.substring(3);

    if (!tsStr || !h1Str) return false;

    // Build signed payload: timestamp:body
    const signedPayload = `${tsStr}:${body}`;

    // Compute HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return computed === h1Str;
  } catch {
    return false;
  }
}

paddleWebhook.post('/webhook', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('Paddle-Signature');

  // Verify signature
  const isValid = await verifyPaddleSignature(rawBody, signature || null);
  if (!isValid) {
    console.error('Paddle webhook signature verification failed');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const eventType = event.event_type;
  const eventId = event.event_id;

  console.log(`Paddle webhook received: ${eventType} (${eventId})`);

  // Store raw event for audit
  try {
    await db.insert(paddleEvents).values({
      paddleEventId: eventId,
      eventType,
      payload: event,
    });
  } catch (err) {
    // Duplicate event - ignore
    if ((err as any)?.code === '23505') {
      return c.json({ status: 'already_processed' });
    }
    throw err;
  }

  // Process event
  try {
    switch (eventType) {
      case 'subscription.created':
        await handleSubscriptionCreated(event.data);
        break;
      case 'subscription.updated':
        await handleSubscriptionUpdated(event.data);
        break;
      case 'subscription.canceled':
        await handleSubscriptionCancelled(event.data);
        break;
      case 'transaction.completed':
        await handleTransactionCompleted(event.data);
        break;
      case 'transaction.payment_failed':
        await handlePaymentFailed(event.data);
        break;
      default:
        console.log(`Unhandled Paddle event: ${eventType}`);
    }

    // Mark as processed
    await db
      .update(paddleEvents)
      .set({ processedAt: new Date() })
      .where(eq(paddleEvents.paddleEventId, eventId));
  } catch (error) {
    console.error(`Error processing Paddle event ${eventType}:`, error);
    await db
      .update(paddleEvents)
      .set({ processingError: error instanceof Error ? error.message : 'Unknown error' })
      .where(eq(paddleEvents.paddleEventId, eventId));
  }

  return c.json({ status: 'ok' });
});

// --- Event Handlers ---

async function handleSubscriptionCreated(data: any) {
  const { id, customer_id, status, items, custom_data, current_billing_period } = data;

  // custom_data contains our internal IDs: { agencyId, companyId, type }
  const meta = custom_data || {};

  await db.insert(subscriptions).values({
    paddleSubscriptionId: id,
    paddleCustomerId: customer_id,
    paddlePriceId: items?.[0]?.price?.id || null,
    agencyId: meta.agencyId ? parseInt(meta.agencyId) : null,
    companyId: meta.companyId ? parseInt(meta.companyId) : null,
    pricingTier: meta.pricingTier || 'agency',
    billingCycle: meta.billingCycle || 'monthly',
    priceAmountRsd: meta.priceAmountRsd ? parseInt(meta.priceAmountRsd) : 599,
    status: status === 'active' ? 'active' : 'trialing',
    currentPeriodStart: current_billing_period?.starts_at
      ? new Date(current_billing_period.starts_at)
      : null,
    currentPeriodEnd: current_billing_period?.ends_at
      ? new Date(current_billing_period.ends_at)
      : null,
  });

  // Update agency subscription status if this is an agency subscription
  if (meta.agencyId) {
    await db
      .update(agencies)
      .set({
        paddleCustomerId: customer_id,
        paddleSubscriptionId: id,
        subscriptionStatus: 'active',
        updatedAt: new Date(),
      })
      .where(eq(agencies.id, parseInt(meta.agencyId)));
  }

  // Update company if this is a per-client subscription
  if (meta.companyId) {
    await db
      .update(companies)
      .set({
        paddleSubscriptionId: id,
        pricingTier: meta.pricingTier || null,
        billingCycle: meta.billingCycle || 'monthly',
        updatedAt: new Date(),
      })
      .where(eq(companies.id, parseInt(meta.companyId)));
  }

  console.log(`Subscription created: ${id} for ${meta.type || 'unknown'}`);
}

async function handleSubscriptionUpdated(data: any) {
  const { id, status, current_billing_period } = data;

  await db
    .update(subscriptions)
    .set({
      status: mapPaddleStatus(status),
      currentPeriodStart: current_billing_period?.starts_at
        ? new Date(current_billing_period.starts_at)
        : undefined,
      currentPeriodEnd: current_billing_period?.ends_at
        ? new Date(current_billing_period.ends_at)
        : undefined,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.paddleSubscriptionId, id));

  console.log(`Subscription updated: ${id} → ${status}`);
}

async function handleSubscriptionCancelled(data: any) {
  const { id } = data;

  // Get the subscription to find related agency/company
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.paddleSubscriptionId, id))
    .limit(1);

  if (sub) {
    await db
      .update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.paddleSubscriptionId, id));

    // Update agency status if agency subscription
    if (sub.agencyId && !sub.companyId) {
      await db
        .update(agencies)
        .set({ subscriptionStatus: 'cancelled', updatedAt: new Date() })
        .where(eq(agencies.id, sub.agencyId));
    }
  }

  console.log(`Subscription cancelled: ${id}`);
}

async function handleTransactionCompleted(data: any) {
  console.log(`Transaction completed: ${data.id}, amount: ${data.details?.totals?.total}`);
}

async function handlePaymentFailed(data: any) {
  const subscriptionId = data.subscription_id;
  if (subscriptionId) {
    await db
      .update(subscriptions)
      .set({ status: 'past_due', updatedAt: new Date() })
      .where(eq(subscriptions.paddleSubscriptionId, subscriptionId));

    // Update agency status
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.paddleSubscriptionId, subscriptionId))
      .limit(1);

    if (sub?.agencyId && !sub.companyId) {
      await db
        .update(agencies)
        .set({ subscriptionStatus: 'past_due', updatedAt: new Date() })
        .where(eq(agencies.id, sub.agencyId));
    }
  }

  console.log(`Payment failed for subscription: ${subscriptionId}`);
}

function mapPaddleStatus(paddleStatus: string): 'active' | 'past_due' | 'cancelled' | 'paused' | 'trialing' {
  switch (paddleStatus) {
    case 'active': return 'active';
    case 'past_due': return 'past_due';
    case 'canceled': return 'cancelled';
    case 'paused': return 'paused';
    case 'trialing': return 'trialing';
    default: return 'active';
  }
}

export default paddleWebhook;
