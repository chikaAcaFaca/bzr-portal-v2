/**
 * Newsletter Service
 *
 * Manages newsletter subscribers and email campaigns.
 * Sends via Resend batch API (100 per batch).
 */

import { db } from '../db';
import { newsletterSubscribers, newsletterCampaigns } from '../db/schema/newsletter';
import { eq, and, desc, sql } from 'drizzle-orm';
import { sendEmail } from './email.service';
import crypto from 'crypto';

/**
 * Subscribe an email to the newsletter
 */
export async function subscribe(email: string, ime?: string, tip?: string) {
  const unsubscribeToken = crypto.randomBytes(32).toString('hex');

  // Check if already subscribed
  const [existing] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    if (existing.isActive) {
      return { success: true, message: 'Vec ste prijavljeni na newsletter', existing: true };
    }
    // Reactivate
    await db
      .update(newsletterSubscribers)
      .set({
        isActive: true,
        unsubscribedAt: null,
        ime: ime || existing.ime,
        tip: tip || existing.tip,
        unsubscribeToken,
      })
      .where(eq(newsletterSubscribers.id, existing.id));

    return { success: true, message: 'Ponovo ste prijavljeni na newsletter', reactivated: true };
  }

  await db.insert(newsletterSubscribers).values({
    email: email.toLowerCase(),
    ime: ime || null,
    tip: tip || 'neregistrovan',
    unsubscribeToken,
  });

  return { success: true, message: 'Uspesno ste se prijavili na newsletter' };
}

/**
 * Unsubscribe by token
 */
export async function unsubscribe(token: string) {
  const [subscriber] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.unsubscribeToken, token))
    .limit(1);

  if (!subscriber) {
    return { success: false, message: 'Nevazeci link za odjavu' };
  }

  await db
    .update(newsletterSubscribers)
    .set({ isActive: false, unsubscribedAt: new Date() })
    .where(eq(newsletterSubscribers.id, subscriber.id));

  return { success: true, message: 'Uspesno ste se odjavili sa newsletter-a' };
}

/**
 * List all active subscribers with optional type filter
 */
export async function listSubscribers(tip?: string) {
  const conditions = [eq(newsletterSubscribers.isActive, true)];
  if (tip && tip !== 'svi') {
    conditions.push(eq(newsletterSubscribers.tip, tip));
  }

  return db
    .select()
    .from(newsletterSubscribers)
    .where(and(...conditions))
    .orderBy(desc(newsletterSubscribers.subscribedAt));
}

/**
 * Get subscriber count
 */
export async function getSubscriberCount() {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.isActive, true));

  return result?.count ?? 0;
}

/**
 * Create a newsletter campaign
 */
export async function createCampaign(data: {
  naslov: string;
  sadrzaj: string;
  tipPrimaoca?: string;
  createdBy?: number;
}) {
  const [campaign] = await db
    .insert(newsletterCampaigns)
    .values({
      naslov: data.naslov,
      sadrzaj: data.sadrzaj,
      tipPrimaoca: data.tipPrimaoca || 'svi',
      createdBy: data.createdBy || null,
    })
    .returning();

  return campaign;
}

/**
 * List all campaigns
 */
export async function listCampaigns() {
  return db
    .select()
    .from(newsletterCampaigns)
    .orderBy(desc(newsletterCampaigns.createdAt));
}

/**
 * Send a campaign to subscribers
 */
export async function sendCampaign(campaignId: number) {
  const [campaign] = await db
    .select()
    .from(newsletterCampaigns)
    .where(eq(newsletterCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'sent') throw new Error('Campaign already sent');

  // Get target subscribers
  const subscribers = await listSubscribers(campaign.tipPrimaoca || undefined);

  let sentCount = 0;
  const batchSize = 100;

  // Send in batches
  for (let i = 0; i < subscribers.length; i += batchSize) {
    const batch = subscribers.slice(i, i + batchSize);

    const sendPromises = batch.map(async (subscriber) => {
      const html = generateNewsletterHtml(campaign.naslov, campaign.sadrzaj, subscriber.unsubscribeToken || '');
      try {
        await sendEmail({
          to: subscriber.email,
          subject: campaign.naslov,
          html,
        });
        sentCount++;
      } catch (error) {
        console.error(`Failed to send newsletter to ${subscriber.email}:`, error);
      }
    });

    await Promise.all(sendPromises);
  }

  // Update campaign status
  await db
    .update(newsletterCampaigns)
    .set({
      status: 'sent',
      sentAt: new Date(),
      ukupnoPoslato: sentCount,
    })
    .where(eq(newsletterCampaigns.id, campaignId));

  return { sentCount, totalSubscribers: subscribers.length };
}

/**
 * Generate newsletter HTML template
 */
function generateNewsletterHtml(naslov: string, sadrzaj: string, unsubscribeToken: string): string {
  const unsubscribeUrl = `${process.env.FRONTEND_URL || 'https://bzr-savetnik.com'}/odjava?token=${unsubscribeToken}`;

  return `
    <!DOCTYPE html>
    <html lang="sr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${naslov}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 0; background-color: #f4f4f4;">
      <!-- Header -->
      <div style="background-color: #1a365d; padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">BZR Savetnik</h1>
        <p style="color: #93c5fd; margin: 5px 0 0; font-size: 14px;">Newsletter - Bezbednost i zdravlje na radu</p>
      </div>

      <!-- Content -->
      <div style="background-color: white; padding: 30px;">
        <h2 style="color: #1a365d; margin-top: 0;">${naslov}</h2>
        ${sadrzaj}
      </div>

      <!-- Footer -->
      <div style="padding: 20px 30px; text-align: center; font-size: 12px; color: #999;">
        <p>
          BZR Savetnik | Platforma za bezbednost i zdravlje na radu
        </p>
        <p>
          <a href="${unsubscribeUrl}" style="color: #999; text-decoration: underline;">Odjavi se sa newsletter-a</a>
        </p>
      </div>
    </body>
    </html>
  `;
}

export const newsletterService = {
  subscribe,
  unsubscribe,
  listSubscribers,
  getSubscriberCount,
  createCampaign,
  listCampaigns,
  sendCampaign,
};
