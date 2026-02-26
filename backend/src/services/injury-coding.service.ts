/**
 * Injury Coding Service (AI ESAW Classification)
 *
 * Converts plain-text injury descriptions to ESAW classification codes.
 * Uses DeepSeek/Anthropic API for cost-effective AI coding.
 */

import { db } from '../db';
import { esawClassifications } from '../db/schema/esaw-classifications';
import { eq, and } from 'drizzle-orm';
import { getDeepSeek } from '../lib/ai/providers';

export interface EsawCodeResult {
  tabelaBroj: number;
  tabelaNaziv: string;
  kod: string;
  naziv: string;
  confidence: number; // 0-1
}

export interface EsawCodingResult {
  codes: EsawCodeResult[];
  reasoning: string;
}

/**
 * Code an injury description using AI
 * Takes plain Serbian text and returns ESAW classification codes
 */
export async function codeInjuryDescription(description: string): Promise<EsawCodingResult> {
  const deepseek = getDeepSeek();

  const systemPrompt = `Ti si strucnjak za klasifikaciju povreda na radu po ESAW (European Statistics on Accidents at Work) metodologiji.

Na osnovu opisa povrede na radu, odredi odgovarajuce ESAW kodove za sledece tabele:

Tabela 5 - Radno okruzenje (npr. 10=Industrijski pogon, 20=Gradiliste, 40=Kancelarija)
Tabela 6 - Radni proces (npr. 10=Proizvodnja, 20=Gradjevinarstvo, 40=Usluge)
Tabela 7 - Specificna fizicka aktivnost (npr. 20=Rad sa alatom, 40=Rucno rukovanje, 60=Kretanje)
Tabela 8 - Odstupanje od normalnog (npr. 30=Lom/pad agensa, 40=Gubitak kontrole, 50=Pad osobe, 52=Pad na istom nivou)
Tabela 9 - Nacin povredjivanja (npr. 30=Udar, 50=Kontakt sa ostrim, 60=Zahvatanje, 70=Fizicko opterecenje)
Tabela 10 - Materijalni uzrocnik odstupanja (npr. 01=Zgrade/povrsine, 06=Rucni alat, 14=Materijali/predmeti)
Tabela 11 - Materijalni uzrocnik povredjivanja (iste kategorije kao tabela 10)
Tabela 12 - Povredjeni deo tela (npr. 10=Glava, 30=Ledja, 50=Gornji ekstremiteti, 54=Saka, 60=Donji ekstremiteti)
Tabela 13 - Vrsta povrede (npr. 010=Rane, 020=Prelomi, 030=Uganuci, 060=Opekotine)

Vrati JSON objekat u sledecem formatu:
{
  "codes": [
    {"tabelaBroj": 5, "tabelaNaziv": "Radno okruzenje", "kod": "XX", "naziv": "...", "confidence": 0.9},
    {"tabelaBroj": 6, "tabelaNaziv": "Radni proces", "kod": "XX", "naziv": "...", "confidence": 0.85},
    ...za sve tabele 5-13
  ],
  "reasoning": "Kratko objasnjenje kako si dosao do kodova na srpskom jeziku"
}

Budi precizan. Ako iz opisa ne mozes pouzdano odrediti kod, stavi confidence < 0.5.`;

  const response = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Opis povrede: ${description}` },
    ],
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  const result = JSON.parse(content) as EsawCodingResult;

  // Validate codes against database
  for (const code of result.codes) {
    const [valid] = await db
      .select()
      .from(esawClassifications)
      .where(
        and(
          eq(esawClassifications.tabelaBroj, code.tabelaBroj),
          eq(esawClassifications.kod, code.kod)
        )
      )
      .limit(1);

    if (!valid) {
      code.confidence = Math.min(code.confidence, 0.3); // Lower confidence for unmatched codes
    }
  }

  return result;
}

/**
 * Get all ESAW codes for a specific table (for dropdowns)
 */
export async function getEsawOptions(tabelaBroj: number) {
  return db
    .select()
    .from(esawClassifications)
    .where(eq(esawClassifications.tabelaBroj, tabelaBroj))
    .orderBy(esawClassifications.kod);
}

/**
 * Get all ESAW tables summary
 */
export async function getEsawTablesSummary() {
  const tables = await db
    .select({
      tabelaBroj: esawClassifications.tabelaBroj,
      tabelaNaziv: esawClassifications.tabelaNaziv,
    })
    .from(esawClassifications)
    .groupBy(esawClassifications.tabelaBroj, esawClassifications.tabelaNaziv)
    .orderBy(esawClassifications.tabelaBroj);

  return tables;
}

/**
 * Validate that a set of ESAW codes are internally consistent
 */
export function validateEsawCodes(codes: Record<string, string>): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check that body part and injury type are compatible
  if (codes.tabela12 && codes.tabela13) {
    // Head injuries with leg injury types, etc.
    const bodyPart = codes.tabela12;
    const injuryType = codes.tabela13;

    if (bodyPart.startsWith('1') && injuryType === '040') {
      warnings.push('Traumatska amputacija glave je neobicna klasifikacija - proverite');
    }
  }

  return { valid: warnings.length === 0, warnings };
}

export const injuryCodingService = {
  codeInjuryDescription,
  getEsawOptions,
  getEsawTablesSummary,
  validateEsawCodes,
};
