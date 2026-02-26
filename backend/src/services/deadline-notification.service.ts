/**
 * Deadline Notification Service
 *
 * Sends email reminders for upcoming legal obligations.
 * Notifies BOTH the company and the assigned agency at 30, 7, and 1 day(s) before deadline.
 */

import { db } from '../db';
import { legalObligations } from '../db/schema/evidence-records';
import { companies } from '../db/schema/companies';
import { agencies } from '../db/schema/agencies';
import { eq, and, sql, lte, gte } from 'drizzle-orm';
import { sendEmail } from './email.service';

interface NotificationResult {
  sent: number;
  errors: number;
}

/**
 * Check and send all pending deadline notifications
 * Should be called periodically (cron or API trigger)
 */
export async function checkAndSendNotifications(): Promise<NotificationResult> {
  let sent = 0;
  let errors = 0;

  // Find obligations needing 30-day notification
  const thirtyDayItems = await db
    .select()
    .from(legalObligations)
    .where(
      and(
        eq(legalObligations.status, 'aktivan'),
        eq(legalObligations.notifikovanoDana30, false),
        sql`${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '30 days'`,
        sql`${legalObligations.rokDatum} > CURRENT_DATE`
      )
    );

  for (const obligation of thirtyDayItems) {
    try {
      await sendDeadlineEmail(obligation, 30);
      await db
        .update(legalObligations)
        .set({ notifikovanoDana30: true, updatedAt: new Date() })
        .where(eq(legalObligations.id, obligation.id));
      sent++;
    } catch (err) {
      console.error(`Failed to send 30-day notification for obligation ${obligation.id}:`, err);
      errors++;
    }
  }

  // Find obligations needing 7-day notification
  const sevenDayItems = await db
    .select()
    .from(legalObligations)
    .where(
      and(
        eq(legalObligations.status, 'aktivan'),
        eq(legalObligations.notifikovanoDana7, false),
        sql`${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '7 days'`,
        sql`${legalObligations.rokDatum} > CURRENT_DATE`
      )
    );

  for (const obligation of sevenDayItems) {
    try {
      await sendDeadlineEmail(obligation, 7);
      await db
        .update(legalObligations)
        .set({ notifikovanoDana7: true, updatedAt: new Date() })
        .where(eq(legalObligations.id, obligation.id));
      sent++;
    } catch (err) {
      console.error(`Failed to send 7-day notification for obligation ${obligation.id}:`, err);
      errors++;
    }
  }

  // Find obligations needing 1-day notification
  const oneDayItems = await db
    .select()
    .from(legalObligations)
    .where(
      and(
        eq(legalObligations.status, 'aktivan'),
        eq(legalObligations.notifikovanoDana1, false),
        sql`${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '1 day'`,
        sql`${legalObligations.rokDatum} > CURRENT_DATE`
      )
    );

  for (const obligation of oneDayItems) {
    try {
      await sendDeadlineEmail(obligation, 1);
      await db
        .update(legalObligations)
        .set({ notifikovanoDana1: true, updatedAt: new Date() })
        .where(eq(legalObligations.id, obligation.id));
      sent++;
    } catch (err) {
      console.error(`Failed to send 1-day notification for obligation ${obligation.id}:`, err);
      errors++;
    }
  }

  // Find expired obligations not yet notified
  const expiredItems = await db
    .select()
    .from(legalObligations)
    .where(
      and(
        eq(legalObligations.status, 'aktivan'),
        eq(legalObligations.notifikovanoIsteklo, false),
        sql`${legalObligations.rokDatum} < CURRENT_DATE`
      )
    );

  for (const obligation of expiredItems) {
    try {
      await sendDeadlineEmail(obligation, 0); // 0 = expired
      await db
        .update(legalObligations)
        .set({ notifikovanoIsteklo: true, status: 'istekao', updatedAt: new Date() })
        .where(eq(legalObligations.id, obligation.id));
      sent++;
    } catch (err) {
      console.error(`Failed to send expiry notification for obligation ${obligation.id}:`, err);
      errors++;
    }
  }

  return { sent, errors };
}

/**
 * Send deadline email to both company and agency
 */
async function sendDeadlineEmail(
  obligation: typeof legalObligations.$inferSelect,
  daysRemaining: number
): Promise<void> {
  // Get company info
  const [company] = await db
    .select({ name: companies.name, email: companies.email, ownerEmail: companies.ownerEmail })
    .from(companies)
    .where(eq(companies.id, obligation.companyId))
    .limit(1);

  // Get agency info
  let agencyEmail: string | null = null;
  let agencyName: string | null = null;
  if (obligation.agencyId) {
    const [agency] = await db
      .select({ name: agencies.name, email: agencies.email })
      .from(agencies)
      .where(eq(agencies.id, obligation.agencyId))
      .limit(1);
    agencyEmail = agency?.email ?? null;
    agencyName = agency?.name ?? null;
  }

  const urgencyColor = daysRemaining === 0 ? '#D13438' : daysRemaining <= 7 ? '#CA5010' : '#107C10';
  const urgencyText = daysRemaining === 0
    ? 'ISTEKAO ROK'
    : daysRemaining === 1
    ? 'Istice SUTRA'
    : `Istice za ${daysRemaining} dana`;

  const html = `
    <!DOCTYPE html>
    <html lang="sr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${urgencyColor}; color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="margin: 0;">Podsetnik: ${urgencyText}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
        <p><strong>Kompanija:</strong> ${company?.name || 'N/A'}</p>
        <p><strong>Obaveza:</strong> ${obligation.opis}</p>
        <p><strong>Rok:</strong> ${obligation.rokDatum}</p>
        ${obligation.workerName ? `<p><strong>Zaposleni:</strong> ${obligation.workerName}</p>` : ''}
        ${obligation.pravniOsnov ? `<p><strong>Pravni osnov:</strong> ${obligation.pravniOsnov}</p>` : ''}
        <div style="text-align: center; margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://bzr-savetnik.com'}/app/evidencije"
             style="background-color: #107C10; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Pogledaj evidencije
          </a>
        </div>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
        BZR Savetnik - Automatsko obavestenje o isteku zakonske obaveze
      </p>
    </body>
    </html>
  `;

  const subject = `${urgencyText}: ${obligation.opis} - ${company?.name || ''}`;

  // Send to company
  const companyEmail = company?.ownerEmail || company?.email;
  if (companyEmail) {
    await sendEmail({ to: companyEmail, subject, html }).catch(err =>
      console.error('Failed to email company:', err)
    );
  }

  // Send to agency
  if (agencyEmail) {
    await sendEmail({ to: agencyEmail, subject, html }).catch(err =>
      console.error('Failed to email agency:', err)
    );
  }
}

export const deadlineNotificationService = {
  checkAndSendNotifications,
};
