/**
 * Identify BZR Agencies from Company Directory
 *
 * Searches the company_directory for companies that are likely BZR agencies
 * based on activity codes and name patterns. Outputs results and optionally
 * flags them in the database.
 *
 * Usage: npx tsx src/scripts/identify-bzr-agencies.ts [--dry-run]
 *
 * Criteria:
 * 1. Activity codes: 7490 (stručne tehničke delatnosti), 7120 (tehničko ispitivanje)
 * 2. Name patterns: bezbednost, zdravlje na radu, zaštita na radu, BZR, procena rizika
 */

import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

const isDryRun = process.argv.includes('--dry-run');

// BZR-related activity codes
const BZR_ACTIVITY_CODES = [
  '7490',  // Ostale stručne, naučne i tehničke delatnosti
  '7120',  // Tehničko ispitivanje i analiza
  '7022',  // Konsultantske aktivnosti u vezi s poslovanjem
  '8559',  // Ostalo obrazovanje (BZR obuke)
];

// BZR-related name patterns (case-insensitive)
const BZR_NAME_PATTERNS = [
  '%bezbednost%zdravlj%',         // bezbednost i zdravlje na radu
  '%zdravlj%na radu%',            // zdravlje na radu
  '%zaštit%na radu%',             // zaštita na radu
  '%zastit%na radu%',             // zaštita na radu (bez dijakritika)
  '%bezbedn%na radu%',            // bezbednost na radu
  '%procen%rizik%',               // procena rizika
  '% bzr %',                      // BZR kao reč
  '%bzr %',                       // počinje sa BZR
  '% bzr',                        // završava sa BZR
  '%b.z.r.%',                     // B.Z.R.
  '%bznr%',                       // BZNR
  '%zaštit%požar%',               // zaštita od požara (često idu uz BZR)
  '%zastit%pozar%',               // zaštita od požara (bez dijakritika)
  '%bezbednosn%konsult%',         // bezbednosni konsalting
  '%safety%',                     // safety (engleski naziv)
  '%occupational health%',        // occupational health (engleski)
  '%medicine rada%',              // medicina rada
  '%medicin%rad%',                // medicina rada
  '%zaštit%životn%sredin%',       // zaštita životne sredine (često uz BZR)
  '%zastit%zivotn%sredin%',       // bez dijakritika
  '%inženjering%bezbedn%',        // inženjering bezbednosti
  '%inzenjering%bezbedn%',        // bez dijakritika
];

async function main() {
  console.log('=== Identifikacija BZR agencija iz direktorijuma ===\n');

  // Check how many companies are in directory
  const [countResult] = await sql`SELECT count(*)::int as count FROM company_directory`;
  console.log(`Ukupno firmi u direktorijumu: ${countResult.count.toLocaleString()}\n`);

  if (countResult.count === 0) {
    console.log('Direktorijum je prazan! Prvo pokrenite APR import:');
    console.log('  npx tsx src/scripts/import-apr-directory.ts\n');
    await sql.end();
    return;
  }

  // Step 1: Find by activity code
  console.log('--- Pretraga po šifri delatnosti ---');
  const byActivityCode = await sql`
    SELECT id, maticni_broj, poslovno_ime, sifra_delatnosti, opstina, status
    FROM company_directory
    WHERE sifra_delatnosti = ANY(${BZR_ACTIVITY_CODES})
    AND (status IS NULL OR status NOT ILIKE '%brisan%')
    ORDER BY poslovno_ime
  `;
  console.log(`Pronađeno po šifri delatnosti (${BZR_ACTIVITY_CODES.join(', ')}): ${byActivityCode.length}\n`);

  // Step 2: Find by name pattern
  console.log('--- Pretraga po nazivu ---');
  const nameConditions = BZR_NAME_PATTERNS.map(p => `poslovno_ime ILIKE '${p}'`).join(' OR ');
  const byName = await sql.unsafe(`
    SELECT id, maticni_broj, poslovno_ime, sifra_delatnosti, opstina, status
    FROM company_directory
    WHERE (${nameConditions})
    AND (status IS NULL OR status NOT ILIKE '%brisan%')
    ORDER BY poslovno_ime
  `);
  console.log(`Pronađeno po nazivu: ${byName.length}\n`);

  // Step 3: Combine (unique by maticni_broj)
  const allCandidates = new Map<string, any>();

  for (const row of byActivityCode) {
    allCandidates.set(row.maticni_broj, { ...row, matchedBy: 'activity_code' });
  }
  for (const row of byName) {
    if (allCandidates.has(row.maticni_broj)) {
      allCandidates.get(row.maticni_broj).matchedBy = 'both';
    } else {
      allCandidates.set(row.maticni_broj, { ...row, matchedBy: 'name' });
    }
  }

  // Step 4: Narrow down - high confidence BZR agencies
  // Name must contain BZR-specific terms (not just generic consulting)
  const strictBzrPatterns = [
    /bezbednost/i,
    /zdravlj.*na.*radu/i,
    /za[sš]tit.*na.*radu/i,
    /procen.*rizik/i,
    /\bbzr\b/i,
    /\bbznr\b/i,
    /b\.z\.r/i,
    /safety/i,
    /occupational\s+health/i,
    /medicin.*rad/i,
  ];

  const highConfidence: any[] = [];
  const mediumConfidence: any[] = [];

  for (const [mb, candidate] of allCandidates) {
    const nameMatchesStrict = strictBzrPatterns.some(p => p.test(candidate.poslovno_ime));

    if (nameMatchesStrict) {
      highConfidence.push(candidate);
    } else if (candidate.matchedBy === 'activity_code') {
      mediumConfidence.push(candidate);
    }
  }

  console.log('=== REZULTATI ===\n');
  console.log(`Visoka pouzdanost (naziv sadrži BZR termine): ${highConfidence.length}`);
  console.log(`Srednja pouzdanost (samo šifra delatnosti 7490/7120): ${mediumConfidence.length}`);
  console.log(`Ukupno kandidata: ${allCandidates.size}\n`);

  // Print high confidence results
  if (highConfidence.length > 0) {
    console.log('--- VISOKA POUZDANOST (Top 50) ---');
    const display = highConfidence.slice(0, 50);
    for (const c of display) {
      console.log(`  ${c.maticni_broj} | ${c.poslovno_ime} | ${c.opstina || '-'} | ${c.sifra_delatnosti || '-'} | ${c.status || '-'}`);
    }
    if (highConfidence.length > 50) {
      console.log(`  ... i još ${highConfidence.length - 50}\n`);
    }
  }

  // Step 5: Flag in database (if not dry run)
  if (!isDryRun && highConfidence.length > 0) {
    console.log('\n--- Označavanje u bazi ---');

    // Update company_directory - set napomena field for identified agencies
    const highConfMBs = highConfidence.map(c => c.maticni_broj);

    // Mark high confidence as BZR agencies
    const updated = await sql`
      UPDATE company_directory
      SET
        napomena = COALESCE(napomena, '') ||
          CASE WHEN napomena IS NOT NULL AND napomena != '' THEN E'\n' ELSE '' END ||
          '[AUTO] Identifikovana kao potencijalna BZR agencija',
        bzr_saradnja = 'bzr_agencija',
        updated_at = now()
      WHERE maticni_broj = ANY(${highConfMBs})
      AND (bzr_saradnja IS NULL OR bzr_saradnja != 'bzr_agencija')
    `;

    console.log(`Označeno ${highConfMBs.length} firmi kao potencijalnih BZR agencija`);
    console.log(`(bzr_saradnja = 'bzr_agencija')`);
  } else if (isDryRun) {
    console.log('\n[DRY RUN] Nije izvršeno označavanje u bazi. Pokrenite bez --dry-run za upis.');
  }

  // Summary
  console.log('\n=== STATISTIKA ===');
  console.log(`Ukupno u direktorijumu: ${countResult.count.toLocaleString()}`);
  console.log(`BZR kandidati (visoka pouzdanost): ${highConfidence.length}`);
  console.log(`BZR kandidati (srednja pouzdanost): ${mediumConfidence.length}`);
  console.log(`Procenat: ${((highConfidence.length / countResult.count) * 100).toFixed(3)}%`);

  await sql.end();
}

main().catch(err => {
  console.error('Greška:', err);
  process.exit(1);
});
