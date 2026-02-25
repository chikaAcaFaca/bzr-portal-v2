/**
 * APR Company Directory Import Script
 *
 * Fetches ~750k Serbian companies from APR Open Data API and imports them
 * into the company_directory table. Uses batch upsert (1000 rows at a time).
 *
 * Uses raw postgres client to avoid circular schema dependency issues.
 *
 * Usage: npx tsx src/scripts/import-apr-directory.ts
 *
 * Note: Set NODE_TLS_REJECT_UNAUTHORIZED=0 if APR SSL certificate issues occur.
 */

import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

const APR_API_URL = 'https://openapi.apr.gov.rs/api/opendata/companies';
const BATCH_SIZE = 1000;

interface AprCompany {
  MaticniBroj: string;
  PoslovnoIme: string;
  SifraOpstine?: string;
  NazivOpstine?: string;
  NazivStatus?: string;
  DatumOsnivanja?: string;
  NazivPravneForme?: string;
  SifraDelatnosti?: string;
}

interface DirectoryRecord {
  maticni_broj: string;
  poslovno_ime: string;
  pravna_forma: string | null;
  sifra_delatnosti: string | null;
  opstina: string | null;
  sifra_opstine: string | null;
  datum_osnivanja: string | null;
  status: string | null;
}

interface AprApiResponse {
  DatumPreseka: string;
  Podaci: Record<string, AprCompany>;
}

async function fetchAprData(): Promise<{ datumPreseka: string; podaci: Record<string, AprCompany> }> {
  console.log('Fetching APR company data...');
  console.log(`URL: ${APR_API_URL}`);

  const response = await fetch(APR_API_URL, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`APR API error: ${response.status} ${response.statusText}`);
  }

  const raw = await response.json() as AprApiResponse;
  const podaci = raw.Podaci;
  const count = Object.keys(podaci).length;
  console.log(`Datum preseka: ${raw.DatumPreseka}`);
  console.log(`Fetched ${count.toLocaleString()} companies from APR`);
  return { datumPreseka: raw.DatumPreseka, podaci };
}

function esc(value: string | null): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

async function batchInsert(records: DirectoryRecord[]): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const values = batch.map(r =>
      `(${esc(r.maticni_broj)}, ${esc(r.poslovno_ime)}, ${esc(r.pravna_forma)}, ${esc(r.sifra_delatnosti)}, ${esc(r.opstina)}, ${esc(r.sifra_opstine)}, ${esc(r.datum_osnivanja)}, ${esc(r.status)}, now(), now(), now())`
    ).join(',\n');

    await sql.unsafe(`
      INSERT INTO company_directory (
        maticni_broj, poslovno_ime, pravna_forma, sifra_delatnosti,
        opstina, sifra_opstine, datum_osnivanja, status,
        datum_preseka_apr, created_at, updated_at
      ) VALUES ${values}
      ON CONFLICT (maticni_broj) DO UPDATE SET
        poslovno_ime = EXCLUDED.poslovno_ime,
        pravna_forma = EXCLUDED.pravna_forma,
        sifra_delatnosti = EXCLUDED.sifra_delatnosti,
        opstina = EXCLUDED.opstina,
        sifra_opstine = EXCLUDED.sifra_opstine,
        datum_osnivanja = EXCLUDED.datum_osnivanja,
        status = EXCLUDED.status,
        datum_preseka_apr = now(),
        updated_at = now()
    `);

    inserted += batch.length;

    if (inserted % 10000 === 0 || inserted === records.length) {
      console.log(`  Imported ${inserted.toLocaleString()} / ${records.length.toLocaleString()} companies`);
    }
  }

  return inserted;
}

/**
 * Link registered companies (from companies table) to directory entries.
 * Sets registrovan=true and copies subscription/agency info.
 */
async function linkRegisteredCompanies(): Promise<number> {
  console.log('\nLinking registered companies to directory...');

  const registeredCompanies = await sql`
    SELECT id, maticni_broj, connected_agency_id, connection_status, subscription_paid_until
    FROM companies
    WHERE maticni_broj IS NOT NULL
  `;

  let linked = 0;

  for (const company of registeredCompanies) {
    if (!company.maticni_broj) continue;

    let agencyName: string | null = null;
    if (company.connected_agency_id) {
      const agencies = await sql`
        SELECT name FROM agencies WHERE id = ${company.connected_agency_id} LIMIT 1
      `.catch(() => []);
      agencyName = agencies[0]?.name ?? null;
    }

    const isSubscriptionActive = company.subscription_paid_until
      ? new Date(company.subscription_paid_until) > new Date()
      : false;

    await sql`
      UPDATE company_directory SET
        registrovan = true,
        datum_registracije = now(),
        pretplata_aktivna = ${isSubscriptionActive},
        pretplata_do = ${company.subscription_paid_until || null},
        bzr_agencija_id = ${company.connected_agency_id || null},
        bzr_agencija_naziv = ${agencyName},
        bzr_saradnja = ${company.connection_status || null},
        updated_at = now()
      WHERE maticni_broj = ${company.maticni_broj}
    `;

    linked++;
  }

  console.log(`Linked ${linked} registered companies`);
  return linked;
}

async function main() {
  console.log('=== APR Company Directory Import ===\n');
  const startTime = Date.now();

  try {
    // Step 1: Fetch APR data
    const { datumPreseka, podaci } = await fetchAprData();

    // Step 2: Transform to database records
    const records: DirectoryRecord[] = Object.entries(podaci).map(([mb, company]) => ({
      maticni_broj: mb,
      poslovno_ime: company.PoslovnoIme || 'N/A',
      pravna_forma: company.NazivPravneForme || null,
      sifra_delatnosti: company.SifraDelatnosti || null,
      opstina: company.NazivOpstine || null,
      sifra_opstine: company.SifraOpstine || null,
      datum_osnivanja: company.DatumOsnivanja || null,
      status: company.NazivStatus || null,
    }));

    console.log(`\nPrepared ${records.length.toLocaleString()} records for import`);

    // Step 3: Batch upsert
    console.log('\nInserting into database...');
    const inserted = await batchInsert(records);
    console.log(`\nCompleted: ${inserted.toLocaleString()} records upserted`);

    // Step 4: Link registered companies
    await linkRegisteredCompanies();

    // Step 5: Final count
    const [countResult] = await sql`SELECT count(*)::int as count FROM company_directory`;
    console.log(`\nTotal rows in company_directory: ${countResult.count.toLocaleString()}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== Import completed in ${elapsed}s ===`);
  } catch (error) {
    console.error('\nImport failed:', error);
    process.exit(1);
  }

  await sql.end();
  process.exit(0);
}

main();
