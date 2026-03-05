/**
 * Migration: Phase 2 - CompanyWall Integration + Nurture + Contract
 *
 * Adds:
 * - company_directory: CompanyWall financial fields + nurture sequence fields
 * - companies: electronic contract acceptance fields
 *
 * Run: npx tsx migrate-phase2.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL not set');
}

const sql = postgres(connectionString);

async function migrate() {
  console.log('Starting migration: Phase 2 - CompanyWall + Nurture + Contract...\n');

  // =============================================
  // company_directory: CompanyWall financial fields
  // =============================================
  console.log('Step 1: Adding CompanyWall financial fields to company_directory...');

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS prihod INTEGER`;
    console.log('   + prihod added');
  } catch (e: any) {
    console.log(`   - prihod: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS rashod INTEGER`;
    console.log('   + rashod added');
  } catch (e: any) {
    console.log(`   - rashod: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS dobit_gubitak INTEGER`;
    console.log('   + dobit_gubitak added');
  } catch (e: any) {
    console.log(`   - dobit_gubitak: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS kapital INTEGER`;
    console.log('   + kapital added');
  } catch (e: any) {
    console.log(`   - kapital: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS company_wall_url VARCHAR(500)`;
    console.log('   + company_wall_url added');
  } catch (e: any) {
    console.log(`   - company_wall_url: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS cw_enriched_at TIMESTAMP`;
    console.log('   + cw_enriched_at added');
  } catch (e: any) {
    console.log(`   - cw_enriched_at: ${e.message}`);
  }

  // =============================================
  // company_directory: Email nurture fields
  // =============================================
  console.log('\nStep 2: Adding email nurture fields to company_directory...');

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS nurture_stage INTEGER DEFAULT 0`;
    console.log('   + nurture_stage added');
  } catch (e: any) {
    console.log(`   - nurture_stage: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS nurture_last_email_at TIMESTAMP`;
    console.log('   + nurture_last_email_at added');
  } catch (e: any) {
    console.log(`   - nurture_last_email_at: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS nurture_opted_out BOOLEAN DEFAULT false`;
    console.log('   + nurture_opted_out added');
  } catch (e: any) {
    console.log(`   - nurture_opted_out: ${e.message}`);
  }

  // Index for nurture batch processing
  try {
    await sql`CREATE INDEX IF NOT EXISTS cd_nurture_idx ON company_directory (nurture_stage, nurture_opted_out) WHERE nurture_opted_out = false AND nurture_stage < 5`;
    console.log('   + nurture processing index created');
  } catch (e: any) {
    console.log(`   - nurture index: ${e.message}`);
  }

  // =============================================
  // companies: Electronic contract fields
  // =============================================
  console.log('\nStep 3: Adding contract fields to companies...');

  try {
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_accepted_at TIMESTAMP`;
    console.log('   + contract_accepted_at added');
  } catch (e: any) {
    console.log(`   - contract_accepted_at: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_ip_address VARCHAR(45)`;
    console.log('   + contract_ip_address added');
  } catch (e: any) {
    console.log(`   - contract_ip_address: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_version VARCHAR(20)`;
    console.log('   + contract_version added');
  } catch (e: any) {
    console.log(`   - contract_version: ${e.message}`);
  }

  // =============================================
  // Verification
  // =============================================
  console.log('\nVerification: Checking new columns...\n');

  const cdCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'company_directory'
      AND column_name IN ('prihod', 'rashod', 'dobit_gubitak', 'kapital', 'company_wall_url', 'cw_enriched_at', 'nurture_stage', 'nurture_last_email_at', 'nurture_opted_out')
    ORDER BY ordinal_position
  `;
  console.log('company_directory new columns:');
  for (const col of cdCols) {
    console.log(`   ${col.column_name} (${col.data_type})`);
  }

  const compCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'companies'
      AND column_name IN ('contract_accepted_at', 'contract_ip_address', 'contract_version')
    ORDER BY ordinal_position
  `;
  console.log('\ncompanies new columns:');
  for (const col of compCols) {
    console.log(`   ${col.column_name} (${col.data_type})`);
  }

  const expectedCd = 9;
  const expectedComp = 3;
  if (cdCols.length === expectedCd && compCols.length === expectedComp) {
    console.log(`\nAll ${expectedCd + expectedComp} new columns verified!`);
  } else {
    console.log(`\nWarning: Expected ${expectedCd} company_directory cols (got ${cdCols.length}), ${expectedComp} companies cols (got ${compCols.length})`);
  }

  console.log('\nPhase 2 migration complete!');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
