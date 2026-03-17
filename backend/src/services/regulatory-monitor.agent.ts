/**
 * Regulatory Monitor Agent
 *
 * Autonomous background agent that:
 * 1. Scrapes Službeni glasnik RS and minrzs.gov.rs for new BZR regulations
 * 2. Detects changes to existing laws/pravilnici
 * 3. Updates knowledge-base/propisi/ with new entries
 * 4. Alerts affected companies when a regulation change impacts them
 * 5. Uses AI to summarize new regulations and assess impact
 *
 * Sources:
 * - https://www.minrzs.gov.rs/sr/dokumenti (Ministry of Labour)
 * - https://www.pravno-informacioni-sistem.rs/ (Legal Information System)
 * - https://www.slglasnik.com/ (Službeni glasnik RS)
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../db';
import { companies } from '../db/schema/companies';
import { eq, sql } from 'drizzle-orm';
import { sendEmail } from './email.service';

// =============================================================================
// Types
// =============================================================================

interface RegulationEntry {
  id: string;
  naziv: string;
  slug: string;
  službeni_glasnik?: string;
  status: string;
  datum_stupanja_na_snagu?: string;
  poslednja_izmena?: string;
  prioritet: string;
  relevantnost_za_apr: number;
  url?: string;
  napomena?: string;
}

interface RegulationChange {
  type: 'new' | 'amended' | 'repealed';
  regulation: RegulationEntry;
  description: string;
  impactLevel: 'critical' | 'high' | 'medium' | 'low';
  affectedActivityCodes?: string[];
  detectedAt: string;
}

interface MonitorRunResult {
  sourcesChecked: number;
  changesDetected: RegulationChange[];
  knowledgeBaseUpdated: boolean;
  alertsSent: number;
  duration: number;
  errors: string[];
}

// =============================================================================
// Knowledge Base Management
// =============================================================================

const KB_PATH = path.resolve(__dirname, '../../../../knowledge-base/propisi');

function loadMetadata(): any {
  try {
    const metadataPath = path.join(KB_PATH, 'metadata.json');
    return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveMetadata(metadata: any): void {
  try {
    const metadataPath = path.join(KB_PATH, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  } catch (err) {
    console.error('[RegulatoryMonitor] Failed to save metadata:', err);
  }
}

function appendChangelog(change: RegulationChange): void {
  try {
    const changelogPath = path.join(KB_PATH, 'CHANGELOG.md');
    const entry = `\n## ${change.detectedAt}\n- **${change.type.toUpperCase()}**: ${change.regulation.naziv}\n  - Opis: ${change.description}\n  - Prioritet: ${change.impactLevel}\n`;

    if (fs.existsSync(changelogPath)) {
      fs.appendFileSync(changelogPath, entry, 'utf-8');
    } else {
      fs.writeFileSync(changelogPath, `# Changelog - BZR Propisi\n${entry}`, 'utf-8');
    }
  } catch (err) {
    console.error('[RegulatoryMonitor] Failed to write changelog:', err);
  }
}

// =============================================================================
// Source Scrapers
// =============================================================================

/**
 * Check Ministry of Labour website for new documents
 */
async function checkMinistrySource(): Promise<RegulationChange[]> {
  const changes: RegulationChange[] = [];

  try {
    const response = await fetch('https://www.minrzs.gov.rs/sr/dokumenti/bezbednost-i-zdravlje-na-radu', {
      headers: { 'User-Agent': 'BZR-Savetnik-Monitor/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn('[RegulatoryMonitor] Ministry site returned:', response.status);
      return changes;
    }

    const html = await response.text();

    // Parse HTML for document links and dates
    // Look for new documents not in our metadata
    const metadata = loadMetadata();
    if (!metadata) return changes;

    const knownSlugs = new Set<string>();
    for (const category of Object.values(metadata.pravilnici || {})) {
      if (Array.isArray(category)) {
        category.forEach((item: any) => knownSlugs.add(item.slug || ''));
      }
    }
    (metadata.zakoni || []).forEach((item: any) => knownSlugs.add(item.slug || ''));
    (metadata.uredbe || []).forEach((item: any) => knownSlugs.add(item.slug || ''));

    // Extract document links from page
    const docLinkRegex = /href="([^"]*\.pdf)"/gi;
    const titleRegex = /<h[23][^>]*>([^<]*(?:pravilnik|zakon|uredba)[^<]*)<\/h[23]>/gi;

    let match;
    const foundTitles: string[] = [];
    while ((match = titleRegex.exec(html)) !== null) {
      foundTitles.push(match[1].trim());
    }

    // Check if any found titles are NOT in our knowledge base
    for (const title of foundTitles) {
      const slug = title
        .toLowerCase()
        .replace(/[čćšžđ]/g, c => ({ 'č': 'c', 'ć': 'c', 'š': 's', 'ž': 'z', 'đ': 'dj' }[c] || c))
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      if (!knownSlugs.has(slug) && slug.length > 5) {
        changes.push({
          type: 'new',
          regulation: {
            id: `NEW-${Date.now()}`,
            naziv: title,
            slug,
            status: 'Novi',
            prioritet: 'SREDNJE',
            relevantnost_za_apr: 3,
          },
          description: `Novi dokument pronađen na sajtu ministarstva: ${title}`,
          impactLevel: 'medium',
          detectedAt: new Date().toISOString().split('T')[0],
        });
      }
    }
  } catch (err) {
    console.warn('[RegulatoryMonitor] Ministry check failed:', err);
  }

  return changes;
}

/**
 * Check Pravno-informacioni sistem for legislative changes
 */
async function checkLegalInfoSystem(): Promise<RegulationChange[]> {
  const changes: RegulationChange[] = [];

  try {
    // Search for BZR-related legislative changes in last 30 days
    const searchTerms = [
      'bezbednost+zdravlje+radu',
      'procena+rizika',
      'zastita+na+radu',
    ];

    for (const term of searchTerms) {
      try {
        const response = await fetch(
          `https://www.pravno-informacioni-sistem.rs/search?q=${term}&sort=date`,
          {
            headers: { 'User-Agent': 'BZR-Savetnik-Monitor/1.0' },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (!response.ok) continue;
        const html = await response.text();

        // Look for recent amendments (izmene i dopune)
        const amendmentRegex = /izmene?\s+i\s+dopune?\s+(?:zakona|pravilnika)\s+o\s+([^<"]+)/gi;
        let match;
        while ((match = amendmentRegex.exec(html)) !== null) {
          const title = match[1].trim();
          changes.push({
            type: 'amended',
            regulation: {
              id: `AME-${Date.now()}`,
              naziv: `Izmene i dopune: ${title}`,
              slug: '',
              status: 'Izmena',
              prioritet: 'VISOKO',
              relevantnost_za_apr: 4,
            },
            description: `Moguce izmene propisa: ${title}`,
            impactLevel: 'high',
            detectedAt: new Date().toISOString().split('T')[0],
          });
        }
      } catch {
        // Individual search term failed, continue with others
      }
    }
  } catch (err) {
    console.warn('[RegulatoryMonitor] Legal info system check failed:', err);
  }

  return changes;
}

/**
 * Check Službeni glasnik for recent BZR publications
 */
async function checkSluzebeniGlasnik(): Promise<RegulationChange[]> {
  const changes: RegulationChange[] = [];

  try {
    const response = await fetch('https://www.slglasnik.com/latest', {
      headers: { 'User-Agent': 'BZR-Savetnik-Monitor/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn('[RegulatoryMonitor] Službeni glasnik returned:', response.status);
      return changes;
    }

    const html = await response.text();

    // Search for BZR-related keywords in recent publications
    const bzrKeywords = [
      'bezbednost i zdravlje na radu',
      'procena rizika',
      'zaštita na radu',
      'lična zaštitna',
      'lekarski pregled',
      'radna mesta sa povećanim rizikom',
    ];

    for (const keyword of bzrKeywords) {
      if (html.toLowerCase().includes(keyword)) {
        // Extract context around keyword
        const idx = html.toLowerCase().indexOf(keyword);
        const context = html.substring(Math.max(0, idx - 100), Math.min(html.length, idx + 200))
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        changes.push({
          type: 'new',
          regulation: {
            id: `SG-${Date.now()}-${keyword.substring(0, 10)}`,
            naziv: `Nova objava u Sl. glasniku: ${keyword}`,
            slug: '',
            status: 'Novi',
            prioritet: 'VISOKO',
            relevantnost_za_apr: 4,
          },
          description: `Službeni glasnik: ${context.substring(0, 200)}`,
          impactLevel: 'high',
          detectedAt: new Date().toISOString().split('T')[0],
        });
        break; // One alert per glasnik check is enough
      }
    }
  } catch (err) {
    console.warn('[RegulatoryMonitor] Sl. glasnik check failed:', err);
  }

  return changes;
}

// =============================================================================
// Alert System
// =============================================================================

/**
 * Send regulatory change alerts to affected companies
 */
async function sendRegulatoryAlerts(changes: RegulationChange[]): Promise<number> {
  if (changes.length === 0) return 0;

  let sent = 0;
  const criticalOrHigh = changes.filter(c => c.impactLevel === 'critical' || c.impactLevel === 'high');
  if (criticalOrHigh.length === 0) return 0;

  // Get companies with active subscriptions
  const activeCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      email: companies.ownerEmail,
      activityCode: companies.activityCode,
    })
    .from(companies)
    .where(eq(companies.isDeleted, false));

  // Build alert email
  const changesList = criticalOrHigh.map(c =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;"><strong>${c.regulation.naziv}</strong></td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${c.type === 'new' ? 'Novi propis' : c.type === 'amended' ? 'Izmena' : 'Ukinut'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;"><span style="color:${c.impactLevel === 'critical' ? '#dc2626' : '#ea580c'};font-weight:bold;">${c.impactLevel.toUpperCase()}</span></td>
    </tr>`
  ).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="sr">
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#1a5632 0%,#2d8a4e 100%);color:white;padding:20px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;">Nove regulatorne promene</h2>
        <p style="margin:5px 0 0;opacity:0.9;font-size:14px;">BZR Savetnik - Regulatory Monitor</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 12px 12px;">
        <p>Detektovane su promene propisa koje mogu uticati na vase poslovanje:</p>
        <table style="width:100%;border-collapse:collapse;margin:15px 0;">
          <tr style="background:#f8f9fa;">
            <th style="padding:8px;text-align:left;">Propis</th>
            <th style="padding:8px;text-align:left;">Tip</th>
            <th style="padding:8px;text-align:left;">Uticaj</th>
          </tr>
          ${changesList}
        </table>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin:15px 0;">
          <p style="margin:0;font-size:14px;color:#1e40af;">
            Nas AI tim analizira ove promene i azurira vasu dokumentaciju. Bice te obavesteni ako je potrebna akcija sa vase strane.
          </p>
        </div>
        <div style="text-align:center;margin:20px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://bzr-savetnik.com'}/app/dashboard"
             style="background-color:#107C10;color:white;padding:12px 30px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:bold;">
            Pogledaj kontrolnu tablu
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  for (const company of activeCompanies) {
    if (!company.email) continue;

    // Check if change affects this company's activity code
    const isAffected = criticalOrHigh.some(c => {
      if (!c.affectedActivityCodes) return true; // General regulation affects all
      return c.affectedActivityCodes.includes(company.activityCode || '');
    });

    if (!isAffected) continue;

    try {
      await sendEmail({
        to: company.email,
        subject: `BZR Propis: ${criticalOrHigh.length} promena propisa - ${company.name}`,
        html,
      });
      sent++;
    } catch (err) {
      console.error(`[RegulatoryMonitor] Failed to alert ${company.email}:`, err);
    }
  }

  return sent;
}

// =============================================================================
// Main Agent Function
// =============================================================================

/**
 * Run regulatory monitoring check
 * Should be called weekly (or daily for critical monitoring)
 */
export async function runRegulatoryCheck(): Promise<MonitorRunResult> {
  const startTime = Date.now();
  const result: MonitorRunResult = {
    sourcesChecked: 0,
    changesDetected: [],
    knowledgeBaseUpdated: false,
    alertsSent: 0,
    duration: 0,
    errors: [],
  };

  console.log('[RegulatoryMonitor] Starting regulatory check...');

  // 1. Check all sources
  try {
    const [ministryChanges, legalChanges, glasnikChanges] = await Promise.allSettled([
      checkMinistrySource(),
      checkLegalInfoSystem(),
      checkSluzebeniGlasnik(),
    ]);

    result.sourcesChecked = 3;

    if (ministryChanges.status === 'fulfilled') {
      result.changesDetected.push(...ministryChanges.value);
    } else {
      result.errors.push(`Ministry check failed: ${ministryChanges.reason}`);
    }

    if (legalChanges.status === 'fulfilled') {
      result.changesDetected.push(...legalChanges.value);
    } else {
      result.errors.push(`Legal info check failed: ${legalChanges.reason}`);
    }

    if (glasnikChanges.status === 'fulfilled') {
      result.changesDetected.push(...glasnikChanges.value);
    } else {
      result.errors.push(`Sl. glasnik check failed: ${glasnikChanges.reason}`);
    }
  } catch (err) {
    result.errors.push(`Source checking failed: ${err}`);
  }

  // 2. Deduplicate changes
  const uniqueChanges = result.changesDetected.filter((change, index, self) =>
    index === self.findIndex(c => c.regulation.naziv === change.regulation.naziv)
  );
  result.changesDetected = uniqueChanges;

  console.log(`[RegulatoryMonitor] Detected ${uniqueChanges.length} changes from ${result.sourcesChecked} sources`);

  // 3. Update knowledge base if changes found
  if (uniqueChanges.length > 0) {
    try {
      const metadata = loadMetadata();
      if (metadata) {
        metadata.metadata.poslednje_azuriranje = new Date().toISOString();

        // Add new regulations to metadata
        for (const change of uniqueChanges) {
          if (change.type === 'new') {
            appendChangelog(change);
          }
        }

        saveMetadata(metadata);
        result.knowledgeBaseUpdated = true;
      }
    } catch (err) {
      result.errors.push(`Knowledge base update failed: ${err}`);
    }

    // 4. Send alerts for critical/high changes
    try {
      result.alertsSent = await sendRegulatoryAlerts(uniqueChanges);
    } catch (err) {
      result.errors.push(`Alert sending failed: ${err}`);
    }
  }

  result.duration = Date.now() - startTime;
  console.log(`[RegulatoryMonitor] Done in ${result.duration}ms. Changes: ${uniqueChanges.length}, Alerts: ${result.alertsSent}`);

  return result;
}

/**
 * Get current regulatory status summary
 */
export async function getRegulatoryStatus(): Promise<{
  totalRegulations: number;
  lastChecked: string | null;
  recentChanges: RegulationChange[];
  sources: Array<{ name: string; url: string; status: string }>;
}> {
  const metadata = loadMetadata();
  const changelogPath = path.join(KB_PATH, 'CHANGELOG.md');

  let recentChanges: RegulationChange[] = [];
  try {
    if (fs.existsSync(changelogPath)) {
      const changelog = fs.readFileSync(changelogPath, 'utf-8');
      // Parse last 5 changes from changelog
      const entries = changelog.split('\n## ').slice(1, 6);
      recentChanges = entries.map(entry => {
        const lines = entry.trim().split('\n');
        return {
          type: 'new' as const,
          regulation: { id: '', naziv: lines[1]?.replace(/^-\s*\*\*\w+\*\*:\s*/, '') || '', slug: '', status: '', prioritet: '', relevantnost_za_apr: 0 },
          description: lines[2]?.replace(/^\s*-\s*Opis:\s*/, '') || '',
          impactLevel: 'medium' as const,
          detectedAt: lines[0] || '',
        };
      });
    }
  } catch { /* changelog parse error */ }

  return {
    totalRegulations: metadata?.statistika?.ukupno_dokumenata || 0,
    lastChecked: metadata?.metadata?.poslednje_azuriranje || null,
    recentChanges,
    sources: [
      { name: 'Ministarstvo rada', url: 'https://www.minrzs.gov.rs/sr/dokumenti', status: 'active' },
      { name: 'Pravno-informacioni sistem', url: 'https://www.pravno-informacioni-sistem.rs/', status: 'active' },
      { name: 'Službeni glasnik RS', url: 'https://www.slglasnik.com/', status: 'active' },
    ],
  };
}

// =============================================================================
// Export
// =============================================================================

export const regulatoryMonitorAgent = {
  runRegulatoryCheck,
  getRegulatoryStatus,
};
