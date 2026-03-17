/**
 * Compliance Tracker Agent
 *
 * Autonomous background agent that:
 * 1. Daily scans ALL registered companies for upcoming obligations
 * 2. Auto-detects new deadlines from evidence records
 * 3. Sends email/push notifications at 30/7/1/0 days before deadline
 * 4. Generates AI-powered compliance reports and suggestions
 * 5. Tracks regulatory changes from knowledge base
 *
 * This is the "brain" that makes the platform SMARTER than the client —
 * it knows what needs to be done before the client even thinks about it.
 */

import { db } from '../db';
import { companies } from '../db/schema/companies';
import { legalObligations } from '../db/schema/evidence-records';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { syncAllObligations } from './obligation-detector.service';
import { checkAndSendNotifications } from './deadline-notification.service';
import { sendEmail } from './email.service';

// =============================================================================
// Types
// =============================================================================

interface ComplianceRunResult {
  companiesScanned: number;
  obligationsCreated: number;
  notificationsSent: number;
  notificationErrors: number;
  reportsGenerated: number;
  duration: number;
  errors: string[];
}

interface CompanyComplianceStatus {
  companyId: number;
  companyName: string;
  overdue: number;
  dueIn7Days: number;
  dueIn30Days: number;
  total: number;
  healthScore: number; // 0-100, lower = worse
}

// =============================================================================
// Main Agent Functions
// =============================================================================

/**
 * Run daily compliance check for ALL registered companies
 * This is the main function that should be called by the cron job
 */
export async function runDailyComplianceCheck(): Promise<ComplianceRunResult> {
  const startTime = Date.now();
  const result: ComplianceRunResult = {
    companiesScanned: 0,
    obligationsCreated: 0,
    notificationsSent: 0,
    notificationErrors: 0,
    reportsGenerated: 0,
    duration: 0,
    errors: [],
  };

  console.log('[ComplianceTracker] Starting daily compliance check...');

  try {
    // 1. Get all active registered companies
    const activeCompanies = await db
      .select({
        id: companies.id,
        name: companies.name,
        agencyId: companies.agencyId,
        ownerEmail: companies.ownerEmail,
        email: companies.email,
      })
      .from(companies)
      .where(
        and(
          eq(companies.isDeleted, false),
          sql`${companies.subscriptionPaidUntil} > CURRENT_DATE OR ${companies.subscriptionPaidUntil} IS NULL`
        )
      );

    result.companiesScanned = activeCompanies.length;
    console.log(`[ComplianceTracker] Scanning ${activeCompanies.length} companies...`);

    // 2. Sync obligations for each company
    for (const company of activeCompanies) {
      try {
        const syncResult = await syncAllObligations(company.id, company.agencyId ?? undefined);
        result.obligationsCreated += syncResult.created;
      } catch (err) {
        const msg = `Failed to sync obligations for company ${company.id} (${company.name}): ${err}`;
        console.error(`[ComplianceTracker] ${msg}`);
        result.errors.push(msg);
      }
    }

    // 3. Send all pending notifications
    console.log('[ComplianceTracker] Sending notifications...');
    const notifResult = await checkAndSendNotifications();
    result.notificationsSent = notifResult.sent;
    result.notificationErrors = notifResult.errors;

    // 4. Auto-prepare documents for upcoming obligations
    console.log('[ComplianceTracker] Preparing documents for upcoming deadlines...');
    try {
      const { runDocumentPreparation } = await import('./document-generator.agent');
      const docResult = await runDocumentPreparation();
      console.log(`[ComplianceTracker] Documents: ${docResult.workflowsCreated} workflows, ${docResult.draftsGenerated} drafts, ${docResult.missingDataAlerts} missing data alerts`);
    } catch (err) {
      console.error('[ComplianceTracker] Document preparation failed:', err);
      result.errors.push(`Document preparation: ${err}`);
    }

    // 5. Generate weekly compliance digest (on Mondays)
    const today = new Date();
    if (today.getDay() === 1) {
      console.log('[ComplianceTracker] Monday - generating weekly digest...');
      const digestsSent = await sendWeeklyComplianceDigest();
      result.reportsGenerated = digestsSent;
    }

  } catch (err) {
    const msg = `Critical error in daily compliance check: ${err}`;
    console.error(`[ComplianceTracker] ${msg}`);
    result.errors.push(msg);
  }

  result.duration = Date.now() - startTime;
  console.log(`[ComplianceTracker] Done in ${result.duration}ms. Scanned: ${result.companiesScanned}, Created: ${result.obligationsCreated}, Notified: ${result.notificationsSent}, Errors: ${result.errors.length}`);

  return result;
}

/**
 * Get compliance health status for a specific company
 */
export async function getCompanyComplianceStatus(companyId: number): Promise<CompanyComplianceStatus> {
  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  // Count overdue
  const [overdueResult] = await db
    .select({ count: count() })
    .from(legalObligations)
    .where(
      and(
        eq(legalObligations.companyId, companyId),
        eq(legalObligations.status, 'istekao')
      )
    );

  // Count due in 7 days
  const [urgentResult] = await db
    .select({ count: count() })
    .from(legalObligations)
    .where(
      and(
        eq(legalObligations.companyId, companyId),
        eq(legalObligations.status, 'aktivan'),
        sql`${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '7 days'`,
        sql`${legalObligations.rokDatum} > CURRENT_DATE`
      )
    );

  // Count due in 30 days
  const [warningResult] = await db
    .select({ count: count() })
    .from(legalObligations)
    .where(
      and(
        eq(legalObligations.companyId, companyId),
        eq(legalObligations.status, 'aktivan'),
        sql`${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '30 days'`,
        sql`${legalObligations.rokDatum} > CURRENT_DATE`
      )
    );

  // Total active
  const [totalResult] = await db
    .select({ count: count() })
    .from(legalObligations)
    .where(
      and(
        eq(legalObligations.companyId, companyId),
        eq(legalObligations.status, 'aktivan')
      )
    );

  const overdue = overdueResult?.count || 0;
  const dueIn7Days = urgentResult?.count || 0;
  const dueIn30Days = warningResult?.count || 0;
  const total = totalResult?.count || 0;

  // Calculate health score: 100 if no issues, -20 per overdue, -10 per urgent, -5 per warning
  const healthScore = Math.max(0, 100 - (overdue * 20) - (dueIn7Days * 10) - (dueIn30Days * 5));

  return {
    companyId: company.id,
    companyName: company.name,
    overdue,
    dueIn7Days,
    dueIn30Days,
    total,
    healthScore,
  };
}

/**
 * Get all companies ranked by compliance health (worst first)
 */
export async function getComplianceDashboard(): Promise<{
  companies: CompanyComplianceStatus[];
  summary: { totalOverdue: number; totalUrgent: number; averageHealth: number };
}> {
  // Get per-company stats in a single query
  const stats = await db
    .select({
      companyId: legalObligations.companyId,
      companyName: companies.name,
      overdue: sql<number>`count(*) filter (where ${legalObligations.status} = 'istekao')::int`,
      dueIn7Days: sql<number>`count(*) filter (where ${legalObligations.status} = 'aktivan' and ${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '7 days' and ${legalObligations.rokDatum} > CURRENT_DATE)::int`,
      dueIn30Days: sql<number>`count(*) filter (where ${legalObligations.status} = 'aktivan' and ${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '30 days' and ${legalObligations.rokDatum} > CURRENT_DATE)::int`,
      total: sql<number>`count(*) filter (where ${legalObligations.status} = 'aktivan')::int`,
    })
    .from(legalObligations)
    .innerJoin(companies, eq(legalObligations.companyId, companies.id))
    .groupBy(legalObligations.companyId, companies.name)
    .orderBy(
      desc(sql`count(*) filter (where ${legalObligations.status} = 'istekao')`),
      desc(sql`count(*) filter (where ${legalObligations.status} = 'aktivan' and ${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '7 days' and ${legalObligations.rokDatum} > CURRENT_DATE)`)
    );

  const companyStatuses: CompanyComplianceStatus[] = stats.map(s => ({
    companyId: s.companyId,
    companyName: s.companyName,
    overdue: s.overdue,
    dueIn7Days: s.dueIn7Days,
    dueIn30Days: s.dueIn30Days,
    total: s.total,
    healthScore: Math.max(0, 100 - (s.overdue * 20) - (s.dueIn7Days * 10) - (s.dueIn30Days * 5)),
  }));

  const totalOverdue = companyStatuses.reduce((sum, c) => sum + c.overdue, 0);
  const totalUrgent = companyStatuses.reduce((sum, c) => sum + c.dueIn7Days, 0);
  const averageHealth = companyStatuses.length > 0
    ? Math.round(companyStatuses.reduce((sum, c) => sum + c.healthScore, 0) / companyStatuses.length)
    : 100;

  return {
    companies: companyStatuses,
    summary: { totalOverdue, totalUrgent, averageHealth },
  };
}

// =============================================================================
// Weekly Compliance Digest
// =============================================================================

/**
 * Send weekly compliance digest to company owners
 * Shows what's upcoming, what's overdue, and proactive suggestions
 */
async function sendWeeklyComplianceDigest(): Promise<number> {
  let sent = 0;

  // Get companies with active obligations
  const companiesWithObligations = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      email: companies.ownerEmail,
      overdue: sql<number>`count(*) filter (where ${legalObligations.status} = 'istekao')::int`,
      upcoming7: sql<number>`count(*) filter (where ${legalObligations.status} = 'aktivan' and ${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '7 days' and ${legalObligations.rokDatum} > CURRENT_DATE)::int`,
      upcoming30: sql<number>`count(*) filter (where ${legalObligations.status} = 'aktivan' and ${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '30 days' and ${legalObligations.rokDatum} > CURRENT_DATE)::int`,
      totalActive: sql<number>`count(*) filter (where ${legalObligations.status} = 'aktivan')::int`,
    })
    .from(companies)
    .innerJoin(legalObligations, eq(companies.id, legalObligations.companyId))
    .where(eq(companies.isDeleted, false))
    .groupBy(companies.id, companies.name, companies.ownerEmail)
    .having(sql`count(*) filter (where ${legalObligations.status} = 'istekao' or (${legalObligations.status} = 'aktivan' and ${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '30 days')) > 0`);

  for (const company of companiesWithObligations) {
    if (!company.email) continue;

    const healthScore = Math.max(0, 100 - (company.overdue * 20) - (company.upcoming7 * 10) - (company.upcoming30 * 5));
    const healthColor = healthScore >= 80 ? '#107C10' : healthScore >= 50 ? '#CA5010' : '#D13438';
    const healthEmoji = healthScore >= 80 ? 'Odlicno' : healthScore >= 50 ? 'Potrebna paznja' : 'Hitno';

    const html = `
      <!DOCTYPE html>
      <html lang="sr">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1a5632 0%, #2d8a4e 100%); color: white; padding: 20px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0;">Nedeljni BZR izvestaj</h2>
          <p style="margin: 5px 0 0; opacity: 0.9; font-size: 14px;">${company.companyName}</p>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 12px 12px;">
          <!-- Health Score -->
          <div style="text-align: center; margin: 10px 0 20px;">
            <div style="display: inline-block; width: 80px; height: 80px; border-radius: 50%; background: ${healthColor}; color: white; line-height: 80px; font-size: 28px; font-weight: bold;">
              ${healthScore}
            </div>
            <p style="margin: 5px 0; font-weight: bold; color: ${healthColor};">${healthEmoji}</p>
          </div>

          <!-- Stats -->
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            ${company.overdue > 0 ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><span style="color: #D13438; font-weight: bold;">Istekli rokovi</span></td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #D13438;">${company.overdue}</td></tr>` : ''}
            ${company.upcoming7 > 0 ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><span style="color: #CA5010;">Istice za 7 dana</span></td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #CA5010;">${company.upcoming7}</td></tr>` : ''}
            ${company.upcoming30 > 0 ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Istice za 30 dana</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${company.upcoming30}</td></tr>` : ''}
            <tr><td style="padding: 8px;">Ukupno aktivnih obaveza</td><td style="padding: 8px; text-align: right; font-weight: bold;">${company.totalActive}</td></tr>
          </table>

          ${company.overdue > 0 ? `
          <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px; margin: 15px 0;">
            <p style="margin: 0; font-size: 14px; color: #991B1B;"><strong>Imate ${company.overdue} isteklih obaveza!</strong> Inspekciija moze izreci kaznu. Preporucujemo da odmah preduzmete akciju.</p>
          </div>` : ''}

          <div style="text-align: center; margin: 20px 0;">
            <a href="${process.env.FRONTEND_URL || 'https://bzr-savetnik.com'}/app/evidencije"
               style="background-color: #107C10; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
              Pogledaj obaveze
            </a>
          </div>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          BZR Savetnik - Vas AI asistent za bezbednost i zdravlje na radu
        </p>
      </body>
      </html>
    `;

    try {
      await sendEmail({
        to: company.email,
        subject: `BZR Izvestaj: ${healthEmoji} (${healthScore}/100) - ${company.companyName}`,
        html,
      });
      sent++;
    } catch (err) {
      console.error(`[ComplianceTracker] Failed to send digest to ${company.email}:`, err);
    }
  }

  console.log(`[ComplianceTracker] Weekly digest sent to ${sent} companies`);
  return sent;
}

// =============================================================================
// Export
// =============================================================================

export const complianceTrackerAgent = {
  runDailyComplianceCheck,
  getCompanyComplianceStatus,
  getComplianceDashboard,
};
