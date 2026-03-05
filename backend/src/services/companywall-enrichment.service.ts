/**
 * CompanyWall Enrichment Service
 *
 * Scrapes CompanyWall.rs for financial data (revenue, expenses, profit/loss,
 * employee count, capital) to supplement the APR enrichment service.
 *
 * Rate limited: 1 request per 3 seconds (more conservative than APR).
 * Cache: don't re-scrape within 90 days (check cwEnrichedAt).
 */

import { db } from '../db';
import { companyDirectory } from '../db/schema/company-directory';
import { eq } from 'drizzle-orm';

const CW_CACHE_DAYS = 90;
const CW_RATE_LIMIT_MS = 3000;

let lastRequestTime = 0;

export interface CompanyWallResult {
  prihod?: number;          // Annual revenue (RSD)
  rashod?: number;          // Annual expenses (RSD)
  dobitGubitak?: number;    // Profit/loss (RSD)
  brojZaposlenih?: number;  // Employee count
  kapital?: number;         // Registered capital (RSD)
  datumOsnivanja?: string;  // Founding date
  kompanijskiUrl?: string;  // CompanyWall URL for reference
}

/**
 * Rate-limit helper: waits until 3 seconds have passed since last request
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < CW_RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, CW_RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Check if CompanyWall enrichment data is still fresh (within 90 days)
 */
function isCwEnrichmentFresh(cwEnrichedAt: Date | null): boolean {
  if (!cwEnrichedAt) return false;
  const ageMs = Date.now() - cwEnrichedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays < CW_CACHE_DAYS;
}

/**
 * Parse a Serbian-formatted number string (e.g., "1.234.567" or "1,234,567") to number
 */
function parseSerbianNumber(text: string): number | undefined {
  if (!text) return undefined;
  // Remove dots used as thousands separators, keep minus sign
  const cleaned = text.replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Scrape CompanyWall.rs search results for a company by PIB
 */
async function scrapeCompanyWall(pib: string): Promise<CompanyWallResult> {
  await waitForRateLimit();

  const result: CompanyWallResult = {};

  try {
    const { load } = await import('cheerio');

    // Step 1: Search by PIB
    const searchUrl = `https://www.companywall.rs/pretraga?query=${pib}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'sr-RS,sr;q=0.9',
      },
    });

    if (!searchResponse.ok) {
      console.warn(`CompanyWall search failed for PIB ${pib}: HTTP ${searchResponse.status}`);
      return result;
    }

    const searchHtml = await searchResponse.text();
    const $search = load(searchHtml);

    // Find company link from search results
    // CompanyWall search results have links like /firma/{slug}/{id}
    const companyLink = $search('a[href*="/firma/"]').first().attr('href');

    if (!companyLink) {
      console.warn(`CompanyWall: No company found for PIB ${pib}`);
      return result;
    }

    // Build full URL
    const companyUrl = companyLink.startsWith('http')
      ? companyLink
      : `https://www.companywall.rs${companyLink}`;
    result.kompanijskiUrl = companyUrl;

    // Step 2: Scrape company page
    await waitForRateLimit();

    const companyResponse = await fetch(companyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'sr-RS,sr;q=0.9',
      },
    });

    if (!companyResponse.ok) {
      console.warn(`CompanyWall company page failed for ${companyUrl}: HTTP ${companyResponse.status}`);
      return result;
    }

    const companyHtml = await companyResponse.text();
    const $ = load(companyHtml);

    // Extract financial data from the page
    // CompanyWall typically shows financial data in tables or data cards

    // Helper to find value next to a label
    const extractByLabel = (label: string): string | undefined => {
      let value: string | undefined;

      // Try table rows
      $('tr, .row, .data-row, [class*="row"]').each((_, el) => {
        const text = $(el).text();
        if (text.includes(label)) {
          // Get the numeric value from the row
          const cells = $(el).find('td, .value, [class*="value"]');
          if (cells.length > 1) {
            value = cells.last().text().trim();
          } else {
            // Try to extract number after the label
            const afterLabel = text.split(label)[1];
            if (afterLabel) {
              const numMatch = afterLabel.match(/[-\d.,\s]+/);
              if (numMatch) value = numMatch[0].trim();
            }
          }
        }
      });

      // Also try definition lists and label-value pairs
      if (!value) {
        $(`dt:contains("${label}"), .label:contains("${label}"), th:contains("${label}")`).each((_, el) => {
          const nextVal = $(el).next().text().trim();
          if (nextVal) value = nextVal;
        });
      }

      return value;
    };

    // Revenue (Prihod / Poslovni prihodi / Ukupni prihodi)
    const prihodStr = extractByLabel('Poslovni prihodi') || extractByLabel('Ukupni prihodi') || extractByLabel('Prihod');
    if (prihodStr) result.prihod = parseSerbianNumber(prihodStr);

    // Expenses (Rashod / Poslovni rashodi / Ukupni rashodi)
    const rashodStr = extractByLabel('Poslovni rashodi') || extractByLabel('Ukupni rashodi') || extractByLabel('Rashod');
    if (rashodStr) result.rashod = parseSerbianNumber(rashodStr);

    // Profit/Loss (Dobit / Neto rezultat / Neto dobit)
    const dobitStr = extractByLabel('Neto rezultat') || extractByLabel('Neto dobit') || extractByLabel('Dobit') || extractByLabel('Gubitak');
    if (dobitStr) result.dobitGubitak = parseSerbianNumber(dobitStr);

    // Employee count (Broj zaposlenih)
    const zaposleniStr = extractByLabel('Broj zaposlenih') || extractByLabel('Zaposleni');
    if (zaposleniStr) {
      const num = parseInt(zaposleniStr.replace(/\D/g, ''), 10);
      if (!isNaN(num)) result.brojZaposlenih = num;
    }

    // Capital (Kapital / Osnovni kapital)
    const kapitalStr = extractByLabel('Kapital') || extractByLabel('Osnovni kapital');
    if (kapitalStr) result.kapital = parseSerbianNumber(kapitalStr);

    // Founding date (Datum osnivanja)
    const datumStr = extractByLabel('Datum osnivanja') || extractByLabel('Osnovana');
    if (datumStr) result.datumOsnivanja = datumStr;

  } catch (error) {
    console.error(`CompanyWall scrape error for PIB ${pib}:`, error);
  }

  return result;
}

/**
 * Enrich a company directory entry with CompanyWall financial data.
 * Returns the enrichment result. Skips if data is already fresh.
 */
export async function enrichFromCompanyWall(maticniBroj: string): Promise<CompanyWallResult | null> {
  // Look up the company to get PIB and check cache
  const [existing] = await db
    .select({
      pib: companyDirectory.maticniBroj, // maticniBroj is used as lookup
      cwEnrichedAt: companyDirectory.cwEnrichedAt,
      email: companyDirectory.email,
    })
    .from(companyDirectory)
    .where(eq(companyDirectory.maticniBroj, maticniBroj))
    .limit(1);

  if (!existing) return null;

  // Skip if still fresh
  if (isCwEnrichmentFresh(existing.cwEnrichedAt)) {
    return null;
  }

  // We need PIB for CompanyWall search - get it from the full record
  const [fullRecord] = await db
    .select()
    .from(companyDirectory)
    .where(eq(companyDirectory.maticniBroj, maticniBroj))
    .limit(1);

  if (!fullRecord) return null;

  // CompanyWall searches by PIB or company name
  // PIB is not directly stored in company_directory - use maticniBroj as search term
  // (CompanyWall accepts both PIB and matični broj as search queries)
  const searchTerm = maticniBroj;

  // Scrape CompanyWall
  const enriched = await scrapeCompanyWall(searchTerm);

  // Update database with non-null fields
  const updateFields: Record<string, unknown> = {
    cwEnrichedAt: new Date(),
    updatedAt: new Date(),
  };

  if (enriched.prihod !== undefined) updateFields.prihod = enriched.prihod;
  if (enriched.rashod !== undefined) updateFields.rashod = enriched.rashod;
  if (enriched.dobitGubitak !== undefined) updateFields.dobitGubitak = enriched.dobitGubitak;
  if (enriched.kapital !== undefined) updateFields.kapital = enriched.kapital;
  if (enriched.kompanijskiUrl) updateFields.companyWallUrl = enriched.kompanijskiUrl;
  if (enriched.brojZaposlenih !== undefined) updateFields.brojZaposlenih = enriched.brojZaposlenih;

  await db
    .update(companyDirectory)
    .set(updateFields)
    .where(eq(companyDirectory.maticniBroj, maticniBroj));

  return enriched;
}

export const companyWallEnrichmentService = {
  enrichFromCompanyWall,
  isCwEnrichmentFresh,
};
