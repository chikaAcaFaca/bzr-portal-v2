/**
 * APR Enrichment Service
 *
 * Scrapes APR website (pretraga2.apr.gov.rs) for contact details
 * not available through the free open data API.
 *
 * Rate limited: 1 request per 2 seconds.
 * Cache: don't re-scrape within 30 days (check enrichedAt).
 */

import { db } from '../db';
import { companyDirectory } from '../db/schema/company-directory';
import { eq } from 'drizzle-orm';

const ENRICHMENT_CACHE_DAYS = 30;
const RATE_LIMIT_MS = 2000;

let lastRequestTime = 0;

interface EnrichmentResult {
  adresa?: string;
  postanskiBroj?: string;
  grad?: string;
  telefon?: string;
  email?: string;
  webSajt?: string;
  imeVlasnika?: string;
  prezimeVlasnika?: string;
  kontaktOsoba?: string;
  brojZaposlenih?: number;
}

/**
 * Rate-limit helper: waits until 2 seconds have passed since last request
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Check if enrichment data is still fresh (within 30 days)
 */
function isEnrichmentFresh(enrichedAt: Date | null): boolean {
  if (!enrichedAt) return false;
  const ageMs = Date.now() - enrichedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays < ENRICHMENT_CACHE_DAYS;
}

/**
 * Scrape APR website for company contact details
 */
async function scrapeAprDetails(maticniBroj: string): Promise<EnrichmentResult> {
  await waitForRateLimit();

  const result: EnrichmentResult = {};

  try {
    // Dynamically import cheerio
    const { load } = await import('cheerio');

    const url = `https://pretraga2.apr.gov.rs/ObjedinjenePretwordsrage/Search/SearchResult?mb=${maticniBroj}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'sr-RS,sr;q=0.9',
      },
    });

    if (!response.ok) {
      console.warn(`APR scrape failed for ${maticniBroj}: HTTP ${response.status}`);
      return result;
    }

    const html = await response.text();
    const $ = load(html);

    // Try to extract data from the APR result page
    // APR uses various table/div structures depending on company type
    const extractField = (label: string): string | undefined => {
      const el = $(`td:contains("${label}"), th:contains("${label}"), dt:contains("${label}")`).first();
      if (el.length) {
        const value = el.next().text().trim();
        return value || undefined;
      }
      return undefined;
    };

    result.adresa = extractField('Adresa') || extractField('Sedište');
    result.telefon = extractField('Telefon');
    result.email = extractField('E-mail') || extractField('Email') || extractField('Elektronska pošta');
    result.webSajt = extractField('Web') || extractField('Internet');

    // Try to extract owner/director info
    const direktorEl = $('td:contains("Direktor"), td:contains("Zastupnik"), td:contains("Preduzetnik")').first();
    if (direktorEl.length) {
      const fullName = direktorEl.next().text().trim();
      if (fullName) {
        const parts = fullName.split(/\s+/);
        if (parts.length >= 2) {
          result.imeVlasnika = parts[0];
          result.prezimeVlasnika = parts.slice(1).join(' ');
        } else {
          result.kontaktOsoba = fullName;
        }
      }
    }

    // Try postal code and city from address
    if (result.adresa) {
      const postalMatch = result.adresa.match(/(\d{5})\s+(.+?)(?:,|$)/);
      if (postalMatch) {
        result.postanskiBroj = postalMatch[1];
        result.grad = postalMatch[2].trim();
      }
    }

    // Try employee count
    const zaposleniEl = extractField('Broj zaposlenih');
    if (zaposleniEl) {
      const num = parseInt(zaposleniEl, 10);
      if (!isNaN(num)) {
        result.brojZaposlenih = num;
      }
    }
  } catch (error) {
    console.error(`APR scrape error for ${maticniBroj}:`, error);
  }

  return result;
}

/**
 * Enrich a company directory entry with APR scraped data.
 * Returns the updated entry. Skips if data is already fresh.
 */
export async function enrichCompany(maticniBroj: string): Promise<EnrichmentResult | null> {
  // Check current enrichment status
  const [existing] = await db
    .select({
      enrichedAt: companyDirectory.enrichedAt,
    })
    .from(companyDirectory)
    .where(eq(companyDirectory.maticniBroj, maticniBroj))
    .limit(1);

  if (!existing) return null;

  // Skip if still fresh
  if (isEnrichmentFresh(existing.enrichedAt)) {
    return null;
  }

  // Scrape APR
  const enriched = await scrapeAprDetails(maticniBroj);

  // Update database with non-null fields
  const updateFields: Record<string, unknown> = {
    enrichedAt: new Date(),
    enrichmentSource: 'apr_scrape',
    updatedAt: new Date(),
  };

  if (enriched.adresa) updateFields.adresa = enriched.adresa;
  if (enriched.postanskiBroj) updateFields.postanskiBroj = enriched.postanskiBroj;
  if (enriched.grad) updateFields.grad = enriched.grad;
  if (enriched.telefon) updateFields.telefon = enriched.telefon;
  if (enriched.email) updateFields.email = enriched.email;
  if (enriched.webSajt) updateFields.webSajt = enriched.webSajt;
  if (enriched.imeVlasnika) updateFields.imeVlasnika = enriched.imeVlasnika;
  if (enriched.prezimeVlasnika) updateFields.prezimeVlasnika = enriched.prezimeVlasnika;
  if (enriched.kontaktOsoba) updateFields.kontaktOsoba = enriched.kontaktOsoba;
  if (enriched.brojZaposlenih !== undefined) updateFields.brojZaposlenih = enriched.brojZaposlenih;

  await db
    .update(companyDirectory)
    .set(updateFields)
    .where(eq(companyDirectory.maticniBroj, maticniBroj));

  return enriched;
}

export const aprEnrichmentService = {
  enrichCompany,
  isEnrichmentFresh,
};
