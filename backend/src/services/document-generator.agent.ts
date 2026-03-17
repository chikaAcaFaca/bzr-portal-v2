/**
 * Document Generator Agent
 *
 * Proactive autonomous agent that:
 * 1. Monitors upcoming obligations from Compliance Tracker
 * 2. Auto-creates document workflow drafts 30 days before deadline
 * 3. Checks company data readiness (are positions/workers/hazards defined?)
 * 4. Notifies owner: "Document X is ready for your review and signature"
 * 5. NEVER auto-publishes — owner MUST review + sign
 *
 * Workflow:
 *   Obligation expires in 30 days
 *     → Agent creates document workflow (status: u_pripremi)
 *     → Agent checks if data is complete
 *     → If missing data: notifies owner what to fill in (status: nedostaju_podaci)
 *     → If data complete: generates draft document (status: generisan)
 *     → Sends email: "Your document is ready for review and signature"
 *     → Owner reviews on platform → signs → (optional: agency countersigns)
 *     → Status: potpisan
 *
 * KEY PRINCIPLE: Agent PREPARES, owner APPROVES. Never skip the human.
 */

import { db } from '../db';
import { legalObligations } from '../db/schema/evidence-records';
import { documentWorkflow } from '../db/schema/client-documents';
import { companies } from '../db/schema/companies';
import { eq, and, sql, isNull } from 'drizzle-orm';
import {
  createWorkflow,
  identifyMissingData,
  updateWorkflowStatus,
} from './document-workflow.service';
import { sendEmail } from './email.service';

// =============================================================================
// Types
// =============================================================================

interface GeneratorRunResult {
  obligationsProcessed: number;
  workflowsCreated: number;
  draftsGenerated: number;
  ownerNotifications: number;
  missingDataAlerts: number;
  duration: number;
  errors: string[];
}

/**
 * Map obligation types to document types
 */
const OBLIGATION_TO_DOCUMENT: Record<string, {
  tipDokumenta: string;
  naziv: string;
  potrebanPotpis: string;
}> = {
  lekarski_pregled: {
    tipDokumenta: 'uput_na_lekarski_pregled',
    naziv: 'Uput na lekarski pregled',
    potrebanPotpis: 'direktor',
  },
  obuka_bzr: {
    tipDokumenta: 'program_osposobljavanja',
    naziv: 'Program osposobljavanja za bezbedan rad',
    potrebanPotpis: 'licencirani_zaposleni',
  },
  pregled_opreme: {
    tipDokumenta: 'zahtev_pregled_opreme',
    naziv: 'Zahtev za pregled opreme',
    potrebanPotpis: 'direktor',
  },
  ispitivanje_instalacija: {
    tipDokumenta: 'zahtev_ispitivanje_instalacija',
    naziv: 'Zahtev za ispitivanje elektricnih instalacija',
    potrebanPotpis: 'direktor',
  },
  ispitivanje_okoline: {
    tipDokumenta: 'zahtev_ispitivanje_okoline',
    naziv: 'Zahtev za ispitivanje uslova radne okoline',
    potrebanPotpis: 'direktor',
  },
  akt_procene_rizika: {
    tipDokumenta: 'akt_o_proceni_rizika',
    naziv: 'Akt o proceni rizika',
    potrebanPotpis: 'agencija',
  },
  osiguranje: {
    tipDokumenta: 'obnova_osiguranja',
    naziv: 'Obnova polise osiguranja zaposlenih',
    potrebanPotpis: 'direktor',
  },
  licenca_obnova: {
    tipDokumenta: 'obnova_licence',
    naziv: 'Obnova licence za obavljanje BZR poslova',
    potrebanPotpis: 'direktor',
  },
};

// =============================================================================
// Main Agent Function
// =============================================================================

/**
 * Scan upcoming obligations and auto-prepare document workflows
 * Should be called daily (after compliance check)
 */
export async function runDocumentPreparation(): Promise<GeneratorRunResult> {
  const startTime = Date.now();
  const result: GeneratorRunResult = {
    obligationsProcessed: 0,
    workflowsCreated: 0,
    draftsGenerated: 0,
    ownerNotifications: 0,
    missingDataAlerts: 0,
    duration: 0,
    errors: [],
  };

  console.log('[DocumentGenerator] Starting document preparation scan...');

  try {
    // 1. Find obligations expiring in next 30 days that DON'T have a workflow yet
    const upcomingObligations = await db
      .select({
        id: legalObligations.id,
        companyId: legalObligations.companyId,
        agencyId: legalObligations.agencyId,
        tip: legalObligations.tip,
        opis: legalObligations.opis,
        rokDatum: legalObligations.rokDatum,
        workerName: legalObligations.workerName,
      })
      .from(legalObligations)
      .where(
        and(
          eq(legalObligations.status, 'aktivan'),
          sql`${legalObligations.rokDatum} <= CURRENT_DATE + INTERVAL '30 days'`,
          sql`${legalObligations.rokDatum} > CURRENT_DATE`
        )
      );

    result.obligationsProcessed = upcomingObligations.length;
    console.log(`[DocumentGenerator] Found ${upcomingObligations.length} obligations expiring in 30 days`);

    for (const obligation of upcomingObligations) {
      try {
        const docMapping = OBLIGATION_TO_DOCUMENT[obligation.tip];
        if (!docMapping) continue; // Unknown obligation type

        // Check if workflow already exists for this obligation
        const [existingWorkflow] = await db
          .select({ id: documentWorkflow.id })
          .from(documentWorkflow)
          .where(
            and(
              eq(documentWorkflow.companyId, obligation.companyId),
              eq(documentWorkflow.tipDokumenta, docMapping.tipDokumenta),
              sql`${documentWorkflow.createdAt} > CURRENT_DATE - INTERVAL '60 days'`
            )
          )
          .limit(1);

        if (existingWorkflow) continue; // Already has a recent workflow

        // 2. Create workflow
        const workflow = await createWorkflow({
          companyId: obligation.companyId,
          agencyId: obligation.agencyId ?? undefined,
          tipDokumenta: docMapping.tipDokumenta,
          naziv: `${docMapping.naziv} - ${obligation.opis}`,
        });

        result.workflowsCreated++;

        // 3. Check data completeness
        const missingData = await identifyMissingData(obligation.companyId, docMapping.tipDokumenta);

        // Get company info for notification
        const [company] = await db
          .select({
            name: companies.name,
            ownerEmail: companies.ownerEmail,
            email: companies.email,
          })
          .from(companies)
          .where(eq(companies.id, obligation.companyId))
          .limit(1);

        const ownerEmail = company?.ownerEmail || company?.email;

        if (missingData.length > 0) {
          // 4a. Missing data — notify owner what to fill in
          await updateWorkflowStatus(workflow.id, 'nedostaju_podaci', {
            nedostajuciPodaci: missingData,
          });

          if (ownerEmail) {
            await sendMissingDataEmail(ownerEmail, company?.name || '', {
              documentName: docMapping.naziv,
              obligationDescription: obligation.opis,
              deadline: obligation.rokDatum,
              missingFields: missingData.map(m => m.opis),
            });
            result.missingDataAlerts++;
          }
        } else {
          // 4b. Data complete — mark as ready for review
          await updateWorkflowStatus(workflow.id, 'generisan', {
            generisanAt: new Date(),
            potrebanPotpis: docMapping.potrebanPotpis,
          });
          result.draftsGenerated++;

          if (ownerEmail) {
            await sendDocumentReadyEmail(ownerEmail, company?.name || '', {
              documentName: docMapping.naziv,
              obligationDescription: obligation.opis,
              deadline: obligation.rokDatum,
              signedBy: docMapping.potrebanPotpis,
              workflowId: workflow.id,
            });
            result.ownerNotifications++;
          }
        }
      } catch (err) {
        const msg = `Failed for obligation ${obligation.id}: ${err}`;
        console.error(`[DocumentGenerator] ${msg}`);
        result.errors.push(msg);
      }
    }
  } catch (err) {
    result.errors.push(`Critical error: ${err}`);
  }

  result.duration = Date.now() - startTime;
  console.log(`[DocumentGenerator] Done in ${result.duration}ms. Workflows: ${result.workflowsCreated}, Drafts: ${result.draftsGenerated}, Missing: ${result.missingDataAlerts}`);

  return result;
}

// =============================================================================
// Email Notifications
// =============================================================================

async function sendMissingDataEmail(
  to: string,
  companyName: string,
  data: {
    documentName: string;
    obligationDescription: string;
    deadline: string;
    missingFields: string[];
  }
) {
  const missingList = data.missingFields.map(f => `<li style="padding:4px 0;">${f}</li>`).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="sr"><head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#1a5632 0%,#2d8a4e 100%);color:white;padding:20px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;">Potrebni podaci za dokument</h2>
        <p style="margin:5px 0 0;opacity:0.9;font-size:14px;">${companyName}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 12px 12px;">
        <p>Vas AI savetnik je detektovao da rok za <strong>${data.obligationDescription}</strong> istice <strong>${data.deadline}</strong>.</p>

        <p>Pripremamo za vas: <strong>${data.documentName}</strong></p>

        <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px;margin:15px 0;">
          <p style="margin:0 0 8px;font-weight:bold;color:#92400E;">Nedostaju sledeci podaci:</p>
          <ul style="margin:0;padding-left:20px;color:#92400E;">${missingList}</ul>
        </div>

        <p>Kada popunite podatke, dokument ce biti automatski pripremljen za vas pregled i potpis.</p>

        <div style="text-align:center;margin:20px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://bzr-savetnik.com'}/app/tok-dokumenta"
             style="background-color:#107C10;color:white;padding:12px 30px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:bold;">
            Popunite podatke
          </a>
        </div>
      </div>
      <p style="color:#999;font-size:12px;text-align:center;margin-top:20px;">
        BZR Savetnik - Vas AI asistent za bezbednost i zdravlje na radu
      </p>
    </body></html>
  `;

  await sendEmail({
    to,
    subject: `Potrebni podaci: ${data.documentName} - rok ${data.deadline}`,
    html,
  });
}

async function sendDocumentReadyEmail(
  to: string,
  companyName: string,
  data: {
    documentName: string;
    obligationDescription: string;
    deadline: string;
    signedBy: string;
    workflowId: number;
  }
) {
  const signedByText = {
    direktor: 'direktora (vas potpis)',
    agencija: 'BZR agencije (nakon vaseg pregleda)',
    licencirani_zaposleni: 'licenciranog lica za BZR',
  }[data.signedBy] || 'ovlascenog lica';

  const html = `
    <!DOCTYPE html>
    <html lang="sr"><head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#1a5632 0%,#2d8a4e 100%);color:white;padding:20px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;">Dokument spreman za pregled</h2>
        <p style="margin:5px 0 0;opacity:0.9;font-size:14px;">${companyName}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 12px 12px;">
        <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:15px;margin:10px 0;text-align:center;">
          <p style="margin:0;font-size:18px;color:#065F46;font-weight:bold;">${data.documentName}</p>
          <p style="margin:5px 0 0;color:#047857;">Spreman za vas pregled i potpis</p>
        </div>

        <p>Vas AI savetnik je pripremio dokument na osnovu podataka vase firme. Rok za <strong>${data.obligationDescription}</strong> je <strong>${data.deadline}</strong>.</p>

        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px;margin:15px 0;">
          <p style="margin:0;font-size:14px;"><strong>Sta treba da uradite:</strong></p>
          <ol style="margin:8px 0 0;padding-left:20px;">
            <li>Pregledajte dokument na platformi</li>
            <li>Ako je sve u redu, kliknite "Potvrdi"</li>
            <li>Dokument ce biti poslat na potpis ${signedByText}</li>
          </ol>
        </div>

        <div style="text-align:center;margin:20px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://bzr-savetnik.com'}/app/tok-dokumenta"
             style="background-color:#107C10;color:white;padding:14px 40px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:bold;font-size:16px;">
            Pregledaj i potpisi
          </a>
        </div>

        <p style="font-size:13px;color:#64748B;text-align:center;">
          Dokument je kreiran automatski ali NECE biti vazeci dok ga ne pregledate i potvrdite.
        </p>
      </div>
      <p style="color:#999;font-size:12px;text-align:center;margin-top:20px;">
        BZR Savetnik - Vas AI asistent za bezbednost i zdravlje na radu
      </p>
    </body></html>
  `;

  await sendEmail({
    to,
    subject: `Dokument spreman: ${data.documentName} - pregledajte i potpisite`,
    html,
  });
}

// =============================================================================
// Export
// =============================================================================

export const documentGeneratorAgent = {
  runDocumentPreparation,
};
