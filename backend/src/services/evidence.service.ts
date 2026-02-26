/**
 * Evidence Service
 *
 * Core service for managing BZR evidence records (Obrazac 1-11).
 * Provides CRUD, auto-population from existing data, and deadline tracking.
 */

import { db } from '../db';
import {
  evidenceHighRiskPositions,
  evidenceHighRiskWorkers,
  evidenceWorkInjuries,
  evidenceOccupationalDiseases,
  evidenceHazardExposure,
  evidenceDangerousMaterials,
  evidenceEquipmentInspections,
  evidenceElectricalInspections,
  evidenceEnvironmentTests,
  evidencePpeIssuance,
  legalObligations,
} from '../db/schema/evidence-records';
import { workPositions } from '../db/schema/work-positions';
import { workers } from '../db/schema/workers';
import { riskAssessments } from '../db/schema/risk-assessments';
import { ppeItems } from '../db/schema/ppe';
import { hazardTypes } from '../db/schema/hazards';
import { eq, and, sql, desc } from 'drizzle-orm';

// Map obrazac number to table
const obrazacTableMap = {
  1: evidenceHighRiskPositions,
  2: evidenceHighRiskWorkers,
  3: evidenceWorkInjuries,
  4: evidenceOccupationalDiseases,
  5: evidenceHazardExposure,
  7: evidenceDangerousMaterials,
  8: evidenceEquipmentInspections,
  9: evidenceElectricalInspections,
  10: evidenceEnvironmentTests,
  11: evidencePpeIssuance,
} as const;

type ObrazacNumber = keyof typeof obrazacTableMap;

/**
 * Get evidence overview stats for a company
 */
export async function getCompanyEvidenceOverview(companyId: number) {
  const stats: Record<string, number> = {};

  for (const [num, table] of Object.entries(obrazacTableMap)) {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(table)
      .where(and(eq(table.companyId, companyId), eq(table.isDeleted, false)));
    stats[`obrazac_${num}`] = result?.count ?? 0;
  }

  // Get overdue obligations count
  const [overdueResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(legalObligations)
    .where(
      and(
        eq(legalObligations.companyId, companyId),
        eq(legalObligations.status, 'aktivan'),
        sql`${legalObligations.rokDatum} < CURRENT_DATE`
      )
    );
  stats.overdue_obligations = overdueResult?.count ?? 0;

  return stats;
}

/**
 * List records for a specific obrazac
 */
export async function listByObrazac(
  obrazac: number,
  companyId: number,
  page: number = 1,
  limit: number = 50
) {
  const table = obrazacTableMap[obrazac as ObrazacNumber];
  if (!table) throw new Error(`Invalid obrazac number: ${obrazac}`);

  const offset = (page - 1) * limit;

  const records = await db
    .select()
    .from(table)
    .where(and(eq(table.companyId, companyId), eq(table.isDeleted, false)))
    .orderBy(table.redniBroj)
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(and(eq(table.companyId, companyId), eq(table.isDeleted, false)));

  return {
    records,
    total: countResult?.count ?? 0,
    page,
    limit,
  };
}

/**
 * Get a single record by ID and obrazac type
 */
export async function getRecord(obrazac: number, id: number) {
  const table = obrazacTableMap[obrazac as ObrazacNumber];
  if (!table) throw new Error(`Invalid obrazac number: ${obrazac}`);

  const [record] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.isDeleted, false)))
    .limit(1);

  return record || null;
}

/**
 * Create a record for a specific obrazac
 */
export async function createRecord(obrazac: number, data: Record<string, unknown>) {
  const table = obrazacTableMap[obrazac as ObrazacNumber];
  if (!table) throw new Error(`Invalid obrazac number: ${obrazac}`);

  const [record] = await db
    .insert(table)
    .values(data as any)
    .returning();

  return record;
}

/**
 * Update an existing record
 */
export async function updateRecord(obrazac: number, id: number, data: Record<string, unknown>) {
  const table = obrazacTableMap[obrazac as ObrazacNumber];
  if (!table) throw new Error(`Invalid obrazac number: ${obrazac}`);

  const [record] = await db
    .update(table)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(table.id, id))
    .returning();

  return record;
}

/**
 * Soft delete a record
 */
export async function deleteRecord(obrazac: number, id: number) {
  const table = obrazacTableMap[obrazac as ObrazacNumber];
  if (!table) throw new Error(`Invalid obrazac number: ${obrazac}`);

  await db
    .update(table)
    .set({ isDeleted: true, updatedAt: new Date() } as any)
    .where(eq(table.id, id));

  return { success: true };
}

/**
 * Auto-populate Obrazac 1 (high risk positions) from risk assessment data
 */
export async function autoPopulateFromRiskAssessment(companyId: number, agencyId: number) {
  // Find all positions with high risk (R > 70 or Ri > 70)
  const highRiskPositions = await db
    .select({
      positionId: workPositions.id,
      positionName: workPositions.positionName,
      jobDescription: workPositions.jobDescription,
      totalCount: workPositions.totalCount,
      ri: riskAssessments.ri,
      r: riskAssessments.r,
      correctiveMeasures: riskAssessments.correctiveMeasures,
    })
    .from(workPositions)
    .innerJoin(riskAssessments, eq(riskAssessments.positionId, workPositions.id))
    .where(
      and(
        eq(workPositions.companyId, companyId),
        eq(workPositions.isDeleted, false),
        eq(riskAssessments.isHighRisk, true)
      )
    );

  // Group by position (may have multiple risk assessments per position)
  const positionMap = new Map<number, typeof highRiskPositions>();
  for (const pos of highRiskPositions) {
    if (!positionMap.has(pos.positionId)) {
      positionMap.set(pos.positionId, []);
    }
    positionMap.get(pos.positionId)!.push(pos);
  }

  let redniBroj = 1;
  const created: any[] = [];

  for (const [positionId, risks] of positionMap) {
    const firstRisk = risks[0];
    const hazardDescriptions = risks.map(r => `Ri=${r.ri}, R=${r.r}`).join('; ');
    const measures = risks.map(r => r.correctiveMeasures).filter(Boolean).join('; ');

    const [record] = await db
      .insert(evidenceHighRiskPositions)
      .values({
        companyId,
        agencyId,
        redniBroj,
        nazivRadnogMesta: firstRisk.positionName,
        opisPoslova: firstRisk.jobDescription || '',
        opasnostiIStetnosti: hazardDescriptions,
        meraZastite: measures,
        brojZaposlenih: firstRisk.totalCount || 0,
        datumUtvrdjivanja: new Date().toISOString().split('T')[0],
      })
      .returning();

    created.push(record);
    redniBroj++;
  }

  return { created: created.length, records: created };
}

/**
 * Auto-populate Obrazac 2 (high risk workers) from workers on high-risk positions
 */
export async function autoPopulateHighRiskWorkers(companyId: number, agencyId: number) {
  const highRiskWorkers = await db
    .select({
      workerId: workers.id,
      fullName: workers.fullName,
      jmbg: workers.jmbg,
      positionName: workPositions.positionName,
    })
    .from(workers)
    .innerJoin(workPositions, eq(workers.positionId, workPositions.id))
    .innerJoin(riskAssessments, eq(riskAssessments.positionId, workPositions.id))
    .where(
      and(
        eq(workers.companyId, companyId),
        eq(workers.isDeleted, false),
        eq(riskAssessments.isHighRisk, true)
      )
    );

  // Deduplicate by worker ID
  const uniqueWorkers = new Map<number, (typeof highRiskWorkers)[0]>();
  for (const w of highRiskWorkers) {
    if (!uniqueWorkers.has(w.workerId)) {
      uniqueWorkers.set(w.workerId, w);
    }
  }

  let redniBroj = 1;
  const created: any[] = [];

  for (const [, worker] of uniqueWorkers) {
    const [record] = await db
      .insert(evidenceHighRiskWorkers)
      .values({
        companyId,
        agencyId,
        redniBroj,
        imeIPrezime: worker.fullName,
        jmbg: worker.jmbg || '',
        nazivRadnogMesta: worker.positionName,
      })
      .returning();

    created.push(record);
    redniBroj++;
  }

  return { created: created.length, records: created };
}

/**
 * Auto-populate Obrazac 11 (PPE issuance) from existing PPE data
 */
export async function autoPopulateFromPpe(companyId: number, agencyId: number) {
  const ppeData = await db
    .select({
      ppeType: ppeItems.ppeType,
      positionName: workPositions.positionName,
      workerName: workers.fullName,
    })
    .from(ppeItems)
    .innerJoin(workPositions, eq(ppeItems.positionId, workPositions.id))
    .leftJoin(workers, eq(workers.positionId, workPositions.id))
    .where(
      and(
        eq(workPositions.companyId, companyId),
        eq(ppeItems.isDeleted, false),
        eq(workPositions.isDeleted, false)
      )
    );

  let redniBroj = 1;
  const created: any[] = [];

  for (const item of ppeData) {
    if (!item.workerName) continue;

    const [record] = await db
      .insert(evidencePpeIssuance)
      .values({
        companyId,
        agencyId,
        redniBroj,
        imeIPrezime: item.workerName,
        radnoMesto: item.positionName,
        nazivSredstva: item.ppeType,
        datumIzdavanja: new Date().toISOString().split('T')[0],
      })
      .returning();

    created.push(record);
    redniBroj++;
  }

  return { created: created.length, records: created };
}

/**
 * Get retention period info for an obrazac
 */
export function getRetentionInfo(obrazac: number) {
  const retentionMap: Record<number, { years: number; description: string }> = {
    1: { years: 40, description: 'Cuva se 40 godina od dana nastanka' },
    2: { years: 40, description: 'Cuva se 40 godina od dana nastanka' },
    3: { years: 40, description: 'Cuva se 40 godina od dana nastanka' },
    4: { years: 40, description: 'Cuva se 40 godina od dana nastanka' },
    5: { years: 40, description: 'Cuva se 40 godina od dana nastanka' },
    7: { years: 40, description: 'Cuva se 40 godina od dana nastanka' },
    8: { years: 6, description: 'Cuva se 6 godina od dana nastanka' },
    9: { years: 6, description: 'Cuva se 6 godina od dana nastanka' },
    10: { years: 6, description: 'Cuva se 6 godina od dana nastanka' },
    11: { years: 40, description: 'Cuva se 40 godina od dana nastanka' },
  };

  return retentionMap[obrazac] || { years: 40, description: 'Cuva se 40 godina od dana nastanka' };
}

export const evidenceService = {
  getCompanyEvidenceOverview,
  listByObrazac,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  autoPopulateFromRiskAssessment,
  autoPopulateHighRiskWorkers,
  autoPopulateFromPpe,
  getRetentionInfo,
};
