/**
 * Obligation Detector Service
 *
 * Auto-detects upcoming legal obligations by scanning existing data:
 * medical exams, training, equipment inspections, sanitary exams, risk assessments.
 * Creates/updates records in the legal_obligations table.
 */

import { db } from '../db';
import { legalObligations } from '../db/schema/evidence-records';
import { evidenceEquipmentInspections, evidenceElectricalInspections, evidenceEnvironmentTests } from '../db/schema/evidence-records';
import { medicalExamRequirements } from '../db/schema/medical-exams';
import { trainingRequirements } from '../db/schema/training';
import { workPositions } from '../db/schema/work-positions';
import { workers } from '../db/schema/workers';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Detect medical exam deadlines from medicalExamRequirements
 * Creates obligations for exams expiring in next 90 days
 */
export async function detectMedicalExamDeadlines(companyId: number, agencyId?: number) {
  const exams = await db
    .select({
      examId: medicalExamRequirements.id,
      examType: medicalExamRequirements.examType,
      frequency: medicalExamRequirements.frequency,
      positionName: workPositions.positionName,
      positionId: workPositions.id,
    })
    .from(medicalExamRequirements)
    .innerJoin(workPositions, eq(medicalExamRequirements.positionId, workPositions.id))
    .where(
      and(
        eq(workPositions.companyId, companyId),
        eq(medicalExamRequirements.isDeleted, false),
        eq(workPositions.isDeleted, false)
      )
    );

  const created: any[] = [];

  for (const exam of exams) {
    // Check if obligation already exists
    const [existing] = await db
      .select()
      .from(legalObligations)
      .where(
        and(
          eq(legalObligations.companyId, companyId),
          eq(legalObligations.tip, 'lekarski_pregled'),
          eq(legalObligations.sourceTable, 'medical_exam_requirements'),
          eq(legalObligations.sourceRecordId, exam.examId)
        )
      )
      .limit(1);

    if (existing) continue;

    // Estimate next exam date based on frequency
    const frequencyMonths = parseFrequencyToMonths(exam.frequency);
    const nextExamDate = new Date();
    nextExamDate.setMonth(nextExamDate.getMonth() + frequencyMonths);

    const [obligation] = await db
      .insert(legalObligations)
      .values({
        companyId,
        agencyId: agencyId || null,
        tip: 'lekarski_pregled',
        opis: `${exam.examType} - ${exam.positionName}`,
        rokDatum: nextExamDate.toISOString().split('T')[0],
        pravniOsnov: 'Zakon o BZR, clan 41',
        sourceTable: 'medical_exam_requirements',
        sourceRecordId: exam.examId,
      })
      .returning();

    created.push(obligation);
  }

  return created;
}

/**
 * Detect training renewal deadlines
 */
export async function detectTrainingDeadlines(companyId: number, agencyId?: number) {
  const trainings = await db
    .select({
      trainingId: trainingRequirements.id,
      trainingType: trainingRequirements.trainingType,
      frequency: trainingRequirements.frequency,
      positionName: workPositions.positionName,
    })
    .from(trainingRequirements)
    .innerJoin(workPositions, eq(trainingRequirements.positionId, workPositions.id))
    .where(
      and(
        eq(workPositions.companyId, companyId),
        eq(trainingRequirements.isDeleted, false),
        eq(workPositions.isDeleted, false)
      )
    );

  const created: any[] = [];

  for (const training of trainings) {
    const [existing] = await db
      .select()
      .from(legalObligations)
      .where(
        and(
          eq(legalObligations.companyId, companyId),
          eq(legalObligations.tip, 'obuka_bzr'),
          eq(legalObligations.sourceTable, 'training_requirements'),
          eq(legalObligations.sourceRecordId, training.trainingId)
        )
      )
      .limit(1);

    if (existing) continue;

    const frequencyMonths = parseFrequencyToMonths(training.frequency);
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + frequencyMonths);

    const [obligation] = await db
      .insert(legalObligations)
      .values({
        companyId,
        agencyId: agencyId || null,
        tip: 'obuka_bzr',
        opis: `${training.trainingType} - ${training.positionName}`,
        rokDatum: nextDate.toISOString().split('T')[0],
        pravniOsnov: 'Zakon o BZR, clan 27-30',
        sourceTable: 'training_requirements',
        sourceRecordId: training.trainingId,
      })
      .returning();

    created.push(obligation);
  }

  return created;
}

/**
 * Detect equipment inspection deadlines from Obrazac 8, 9, 10
 */
export async function detectEquipmentInspections(companyId: number, agencyId?: number) {
  const created: any[] = [];

  // Obrazac 8: Equipment inspections
  const equipment = await db
    .select()
    .from(evidenceEquipmentInspections)
    .where(and(eq(evidenceEquipmentInspections.companyId, companyId), eq(evidenceEquipmentInspections.isDeleted, false)));

  for (const item of equipment) {
    if (!item.sledeciPregled) continue;

    const [existing] = await db
      .select()
      .from(legalObligations)
      .where(
        and(
          eq(legalObligations.companyId, companyId),
          eq(legalObligations.tip, 'pregled_opreme'),
          eq(legalObligations.sourceTable, 'evidence_equipment_inspections'),
          eq(legalObligations.sourceRecordId, item.id)
        )
      )
      .limit(1);

    if (existing) continue;

    const [obligation] = await db
      .insert(legalObligations)
      .values({
        companyId,
        agencyId: agencyId || null,
        tip: 'pregled_opreme',
        opis: `Pregled opreme: ${item.nazivOpreme}`,
        rokDatum: item.sledeciPregled,
        pravniOsnov: 'Zakon o BZR, clan 16',
        sourceTable: 'evidence_equipment_inspections',
        sourceRecordId: item.id,
      })
      .returning();

    created.push(obligation);
  }

  // Obrazac 9: Electrical inspections
  const electrical = await db
    .select()
    .from(evidenceElectricalInspections)
    .where(and(eq(evidenceElectricalInspections.companyId, companyId), eq(evidenceElectricalInspections.isDeleted, false)));

  for (const item of electrical) {
    if (!item.sledeciPregled) continue;

    const [existing] = await db
      .select()
      .from(legalObligations)
      .where(
        and(
          eq(legalObligations.companyId, companyId),
          eq(legalObligations.tip, 'ispitivanje_instalacija'),
          eq(legalObligations.sourceTable, 'evidence_electrical_inspections'),
          eq(legalObligations.sourceRecordId, item.id)
        )
      )
      .limit(1);

    if (existing) continue;

    const [obligation] = await db
      .insert(legalObligations)
      .values({
        companyId,
        agencyId: agencyId || null,
        tip: 'ispitivanje_instalacija',
        opis: `Ispitivanje elektricnih instalacija: ${item.vrstaInstalacije}`,
        rokDatum: item.sledeciPregled,
        pravniOsnov: 'Zakon o BZR, clan 15',
        sourceTable: 'evidence_electrical_inspections',
        sourceRecordId: item.id,
      })
      .returning();

    created.push(obligation);
  }

  // Obrazac 10: Environment tests
  const envTests = await db
    .select()
    .from(evidenceEnvironmentTests)
    .where(and(eq(evidenceEnvironmentTests.companyId, companyId), eq(evidenceEnvironmentTests.isDeleted, false)));

  for (const item of envTests) {
    if (!item.sledeciPregled) continue;

    const [existing] = await db
      .select()
      .from(legalObligations)
      .where(
        and(
          eq(legalObligations.companyId, companyId),
          eq(legalObligations.tip, 'ispitivanje_okoline'),
          eq(legalObligations.sourceTable, 'evidence_environment_tests'),
          eq(legalObligations.sourceRecordId, item.id)
        )
      )
      .limit(1);

    if (existing) continue;

    const [obligation] = await db
      .insert(legalObligations)
      .values({
        companyId,
        agencyId: agencyId || null,
        tip: 'ispitivanje_okoline',
        opis: `Ispitivanje uslova radne okoline: ${item.vrstaIspitivanja}`,
        rokDatum: item.sledeciPregled,
        pravniOsnov: 'Zakon o BZR, clan 14',
        sourceTable: 'evidence_environment_tests',
        sourceRecordId: item.id,
      })
      .returning();

    created.push(obligation);
  }

  return created;
}

/**
 * Sync all obligations for a company
 */
export async function syncAllObligations(companyId: number, agencyId?: number) {
  const results = {
    medicalExams: await detectMedicalExamDeadlines(companyId, agencyId),
    training: await detectTrainingDeadlines(companyId, agencyId),
    equipment: await detectEquipmentInspections(companyId, agencyId),
  };

  // Update expired obligations
  await db
    .update(legalObligations)
    .set({ status: 'istekao', updatedAt: new Date() })
    .where(
      and(
        eq(legalObligations.companyId, companyId),
        eq(legalObligations.status, 'aktivan'),
        sql`${legalObligations.rokDatum} < CURRENT_DATE`
      )
    );

  return {
    created: results.medicalExams.length + results.training.length + results.equipment.length,
    details: results,
  };
}

/**
 * Parse Serbian frequency string to months
 */
function parseFrequencyToMonths(frequency: string): number {
  const lower = frequency.toLowerCase();
  if (lower.includes('godisnj') || lower.includes('godisnje')) return 12;
  if (lower.includes('6 meseci') || lower.includes('polugodisnje')) return 6;
  if (lower.includes('3 mesec') || lower.includes('kvartalno')) return 3;
  if (lower.includes('2 godin') || lower.includes('svake 2')) return 24;
  if (lower.includes('3 godin') || lower.includes('svake 3')) return 36;
  if (lower.includes('5 godin') || lower.includes('svake 5')) return 60;
  if (lower.includes('mesecno') || lower.includes('mesecn')) return 1;
  return 12; // Default: annual
}

export const obligationDetectorService = {
  detectMedicalExamDeadlines,
  detectTrainingDeadlines,
  detectEquipmentInspections,
  syncAllObligations,
};
