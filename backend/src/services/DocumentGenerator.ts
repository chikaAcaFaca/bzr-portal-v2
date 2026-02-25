/**
 * DocumentGenerator Service (T058)
 *
 * Generates Serbian BZR compliance documents (Akt o Proceni Rizika) in DOCX format.
 * Uses docx-templates library with Mustache syntax for template injection.
 *
 * Features:
 * - Loads DOCX template with Serbian Cyrillic
 * - Injects company, position, and risk assessment data
 * - Calculates Ri (initial risk) and R (residual risk) from E×P×F
 * - Determines risk levels (Низак/Средњи/Висок)
 * - Formats dates in Serbian locale
 * - Returns DOCX buffer for blob storage upload
 */

import { createReport } from 'docx-templates';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logInfo, logError } from '../lib/logger';
import type { Company } from '../db/schema/companies';
import type { WorkPosition } from '../db/schema/work-positions';
import type { RiskAssessmentWithHazard } from './RiskAssessmentService';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Types
// =============================================================================

/**
 * Enriched risk data for template injection
 */
interface EnrichedRisk {
  rowNumber: number;
  hazard: {
    code: string;
    nameSr: string;
    category: string;
  };
  initialE: number;
  initialP: number;
  initialF: number;
  initialRi: number;
  initialRiskLevel: string;
  correctiveMeasures: string;
  residualE: number;
  residualP: number;
  residualF: number;
  residualR: number;
  residualRiskLevel: string;
  implementationDeadline: string | null;
  responsiblePerson: string | null;
}

/**
 * Template data structure matching TEMPLATE_SPECIFICATION.md
 */
interface TemplateData {
  company: {
    name: string;
    pib: string;
    maticniBroj: string;
    address: string;
    activityCode: string;
    employeeCount: number;
    director: string;
    bzrResponsiblePerson: string;
  };
  position: {
    positionName: string;
    positionCode: string;
    totalCount: number;
    maleCount: number;
    femaleCount: number;
    jobDescription: string | null;
    requiredEducation: string | null;
    requiredExperience: string | null;
    workSchedule: string | null;
    additionalQualifications: string | null;
  };
  risks: EnrichedRisk[];
  generatedDate: string;
  totalHazardsCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  hasHighRisks: boolean;
}

// =============================================================================
// Risk Level Calculation
// =============================================================================

/**
 * Calculate risk value using E×P×F formula
 *
 * @param e - Consequences (Последице): 1-6
 * @param p - Probability (Вероватноћа): 1-6
 * @param f - Frequency (Учесталост): 1-6
 * @returns Risk value (1-216)
 */
function calculateRisk(e: number, p: number, f: number): number {
  return e * p * f;
}

/**
 * Determine risk level text in Serbian Cyrillic
 *
 * Risk Levels (per Serbian BZR regulations):
 * - R ≤ 36: Низак ризик (прихватљив) - Acceptable
 * - R 37-70: Средњи ризик (потребно праћење) - Requires monitoring
 * - R > 70: Висок ризик (неприхватљив) - Unacceptable, requires immediate action
 *
 * @param riskValue - Calculated risk (E×P×F)
 * @returns Risk level description in Serbian
 */
function getRiskLevel(riskValue: number): string {
  if (riskValue <= 36) {
    return 'Низак ризик (прихватљив)';
  } else if (riskValue <= 70) {
    return 'Средњи ризик (потребно праћење)';
  } else {
    return 'Висок ризик (неприхватљив)';
  }
}

// =============================================================================
// Date Formatting
// =============================================================================

/**
 * Format date in Serbian Cyrillic locale
 *
 * Example output: "23. октобар 2025."
 *
 * @param date - Date to format
 * @returns Formatted date string in Serbian
 */
function formatSerbianDate(date: Date): string {
  const months = [
    'јануар',
    'фебруар',
    'март',
    'април',
    'мај',
    'јун',
    'јул',
    'август',
    'септембар',
    'октобар',
    'новембар',
    'децембар',
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day}. ${month} ${year}.`;
}

// =============================================================================
// DocumentGenerator Service
// =============================================================================

export class DocumentGenerator {
  /**
   * Path to DOCX template file
   */
  private static readonly TEMPLATE_PATH = path.join(
    __dirname,
    '../../templates/Akt_Procena_Rizika_Template.docx'
  );

  /**
   * Generate Akt o Proceni Rizika DOCX document
   *
   * Process:
   * 1. Load DOCX template from templates/
   * 2. Enrich risk assessments with calculated Ri, R, and risk levels
   * 3. Calculate aggregate statistics (high/medium/low risk counts)
   * 4. Format date in Serbian locale
   * 5. Inject data into template using docx-templates
   * 6. Return DOCX buffer ready for blob storage upload
   *
   * @param data - Company, position, and risk assessment data
   * @returns DOCX file as Buffer
   * @throws Error if template not found or generation fails
   */
  static async generate(data: {
    company: Company;
    position: WorkPosition;
    risks: RiskAssessmentWithHazard[];
  }): Promise<Buffer> {
    logInfo('Starting document generation', {
      companyId: data.company.id,
      positionId: data.position.id,
      riskCount: data.risks.length,
    });

    try {
      // 1. Load template
      const template = await fs.readFile(this.TEMPLATE_PATH);
      logInfo('Template loaded successfully', {
        path: this.TEMPLATE_PATH,
        size: template.length,
      });

      // 2. Enrich risks with calculated values
      const enrichedRisks: EnrichedRisk[] = data.risks.map((risk, index) => {
        const initialRi = calculateRisk(risk.ei, risk.pi, risk.fi);
        const residualR = calculateRisk(risk.e, risk.p, risk.f);

        return {
          rowNumber: index + 1,
          hazard: {
            code: risk.hazard.code,
            nameSr: risk.hazard.nameSr,
            category: risk.hazard.category,
          },
          initialE: risk.ei,
          initialP: risk.pi,
          initialF: risk.fi,
          initialRi,
          initialRiskLevel: getRiskLevel(initialRi),
          correctiveMeasures: risk.correctiveMeasures,
          residualE: risk.e,
          residualP: risk.p,
          residualF: risk.f,
          residualR,
          residualRiskLevel: getRiskLevel(residualR),
          implementationDeadline: risk.implementationDeadline
            ? formatSerbianDate(risk.implementationDeadline)
            : null,
          responsiblePerson: risk.responsiblePerson,
        };
      });

      // 3. Calculate aggregate statistics
      const highRiskCount = enrichedRisks.filter((r) => r.residualR > 70).length;
      const mediumRiskCount = enrichedRisks.filter(
        (r) => r.residualR >= 37 && r.residualR <= 70
      ).length;
      const lowRiskCount = enrichedRisks.filter((r) => r.residualR <= 36).length;
      const hasHighRisks = highRiskCount > 0;

      // 4. Prepare template data - flatten risks for simpler access
      const templateData: any = {
        company: {
          name: data.company.name,
          pib: data.company.pib,
          maticniBroj: data.company.maticniBroj || '',
          address: data.company.address,
          activityCode: data.company.activityCode,
          employeeCount: parseInt(data.company.employeeCount || '0', 10),
          director: data.company.director,
          bzrResponsiblePerson: data.company.bzrResponsiblePerson,
        },
        position: {
          positionName: data.position.positionName,
          positionCode: data.position.positionCode || '',
          totalCount: data.position.totalCount ?? 0,
          maleCount: data.position.maleCount ?? 0,
          femaleCount: data.position.femaleCount ?? 0,
          jobDescription: data.position.jobDescription,
          requiredEducation: data.position.requiredEducation,
          requiredExperience: data.position.requiredExperience,
          workSchedule: data.position.workSchedule,
          additionalQualifications: data.position.additionalQualifications,
        },
        // Include risks array for FOR loops
        risks: enrichedRisks,
        // Also include flattened individual risks for direct access
        ...enrichedRisks.reduce((acc, risk, idx) => {
          acc[`risk${idx + 1}`] = risk;
          return acc;
        }, {} as Record<string, any>),
        generatedDate: formatSerbianDate(new Date()),
        totalHazardsCount: enrichedRisks.length,
        highRiskCount,
        mediumRiskCount,
        lowRiskCount,
        hasHighRisks,
      };

      logInfo('Template data prepared', {
        totalHazards: templateData.totalHazardsCount,
        highRisk: highRiskCount,
        mediumRisk: mediumRiskCount,
        lowRisk: lowRiskCount,
        dataKeys: Object.keys(templateData),
      });

      // 5. Generate document
      const buffer = await createReport({
        template,
        data: templateData,
        cmdDelimiter: ['{{', '}}'],
        // Preserve newlines in multi-line fields like jobDescription and correctiveMeasures
        processLineBreaks: true,
        noSandbox: true, // Allow access to all variables in FOR loops
      });

      logInfo('Document generated successfully', {
        bufferSize: buffer.length,
        companyId: data.company.id,
        positionId: data.position.id,
      });

      return buffer;
    } catch (error) {
      logError('Document generation failed', {
        error: error instanceof Error ? error.message : String(error),
        companyId: data.company.id,
        positionId: data.position.id,
      });
      throw new Error(
        `Грешка при генерисању документа: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if template file exists
   *
   * @returns true if template exists, false otherwise
   */
  static async templateExists(): Promise<boolean> {
    try {
      await fs.access(this.TEMPLATE_PATH);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get template file path (for debugging/testing)
   *
   * @returns Absolute path to template file
   */
  static getTemplatePath(): string {
    return this.TEMPLATE_PATH;
  }
}
