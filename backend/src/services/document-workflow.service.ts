/**
 * Document Workflow Service
 *
 * AI-powered document generation workflow.
 * Analyzes company readiness, identifies missing data,
 * generates documents when all data is available.
 */

import { db } from '../db';
import { documentWorkflow } from '../db/schema/client-documents';
import { clientDocuments } from '../db/schema/client-documents';
import { companies } from '../db/schema/companies';
import { workPositions } from '../db/schema/work-positions';
import { workers } from '../db/schema/workers';
import { riskAssessments } from '../db/schema/risk-assessments';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDeepSeek } from '../lib/ai/providers';

/**
 * Create a new document workflow
 */
export async function createWorkflow(data: {
  companyId: number;
  agencyId?: number;
  tipDokumenta: string;
  naziv: string;
}) {
  // Analyze what data is available
  const missingData = await identifyMissingData(data.companyId, data.tipDokumenta);

  const status = missingData.length === 0 ? 'u_pripremi' : 'nedostaju_podaci';

  const [workflow] = await db
    .insert(documentWorkflow)
    .values({
      companyId: data.companyId,
      agencyId: data.agencyId || null,
      tipDokumenta: data.tipDokumenta,
      naziv: data.naziv,
      status,
      nedostajuciPodaci: missingData,
    })
    .returning();

  return workflow;
}

/**
 * Identify what data is missing for a given document type
 */
export async function identifyMissingData(companyId: number, tipDokumenta: string) {
  const missing: Array<{ field: string; opis: string; source: string }> = [];

  // Get company info
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) return [{ field: 'company', opis: 'Kompanija nije pronadjena', source: 'companies' }];

  // Check common required data
  if (!company.pib) missing.push({ field: 'pib', opis: 'PIB kompanije', source: 'companies' });
  if (!company.address) missing.push({ field: 'address', opis: 'Adresa kompanije', source: 'companies' });
  if (!company.director) missing.push({ field: 'director', opis: 'Ime direktora', source: 'companies' });

  // Check positions exist
  const [positionCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workPositions)
    .where(and(eq(workPositions.companyId, companyId), eq(workPositions.isDeleted, false)));

  if ((positionCount?.count ?? 0) === 0) {
    missing.push({ field: 'work_positions', opis: 'Radna mesta nisu definisana', source: 'work_positions' });
  }

  // Check workers exist
  const [workerCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workers)
    .where(and(eq(workers.companyId, companyId), eq(workers.isDeleted, false)));

  if ((workerCount?.count ?? 0) === 0) {
    missing.push({ field: 'workers', opis: 'Zaposleni nisu uneti', source: 'workers' });
  }

  // Document-specific checks
  if (tipDokumenta === 'akt_o_proceni_rizika') {
    const [riskCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(riskAssessments)
      .innerJoin(workPositions, eq(riskAssessments.positionId, workPositions.id))
      .where(and(eq(workPositions.companyId, companyId), eq(riskAssessments.isDeleted, false)));

    if ((riskCount?.count ?? 0) === 0) {
      missing.push({ field: 'risk_assessments', opis: 'Procena rizika nije uredjena', source: 'risk_assessments' });
    }

    if (!company.activityCode) {
      missing.push({ field: 'activity_code', opis: 'Sifra delatnosti', source: 'companies' });
    }
  }

  return missing;
}

/**
 * Analyze company readiness for document generation
 */
export async function analyzeCompanyReadiness(companyId: number, tipDokumenta: string) {
  const missing = await identifyMissingData(companyId, tipDokumenta);

  return {
    isReady: missing.length === 0,
    missingCount: missing.length,
    missingData: missing,
    tipDokumenta,
  };
}

/**
 * Get workflow by ID
 */
export async function getWorkflow(id: number) {
  const [workflow] = await db
    .select()
    .from(documentWorkflow)
    .where(eq(documentWorkflow.id, id))
    .limit(1);

  return workflow || null;
}

/**
 * List workflows for a company
 */
export async function listWorkflows(companyId: number) {
  return db
    .select()
    .from(documentWorkflow)
    .where(eq(documentWorkflow.companyId, companyId))
    .orderBy(desc(documentWorkflow.createdAt));
}

/**
 * Update workflow status
 */
export async function updateWorkflowStatus(id: number, status: string, updates?: Record<string, unknown>) {
  const [workflow] = await db
    .update(documentWorkflow)
    .set({ status, ...updates, updatedAt: new Date() } as any)
    .where(eq(documentWorkflow.id, id))
    .returning();

  return workflow;
}

/**
 * Mark workflow as signed
 */
export async function markSigned(id: number, potpisaoIme: string) {
  const [workflow] = await db
    .update(documentWorkflow)
    .set({
      status: 'potpisan',
      potpisaoIme,
      potpisanAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(documentWorkflow.id, id))
    .returning();

  return workflow;
}

/**
 * Re-analyze workflow after new data is uploaded
 */
export async function reanalyzeWorkflow(workflowId: number) {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) throw new Error('Workflow not found');

  const missing = await identifyMissingData(workflow.companyId, workflow.tipDokumenta);
  const newStatus = missing.length === 0 ? 'u_pripremi' : 'nedostaju_podaci';

  return updateWorkflowStatus(workflowId, newStatus, { nedostajuciPodaci: missing });
}

export const documentWorkflowService = {
  createWorkflow,
  identifyMissingData,
  analyzeCompanyReadiness,
  getWorkflow,
  listWorkflows,
  updateWorkflowStatus,
  markSigned,
  reanalyzeWorkflow,
};
