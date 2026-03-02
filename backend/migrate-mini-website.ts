/**
 * Migration: Mini Web Sajt + Invite System + Premium Agency fields
 *
 * Adds:
 * - company_directory: mini website personalization + claim/invite columns
 * - agencies: premium features columns
 *
 * Run: npx tsx migrate-mini-website.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL not set');
}

const sql = postgres(connectionString);

async function migrate() {
  console.log('Starting migration: Mini Web Sajt + Invite System + Premium Agency...\n');

  // =============================================
  // company_directory: Mini Website fields
  // =============================================
  console.log('Step 1: Adding mini website fields to company_directory...');

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS kratak_opis TEXT`;
    console.log('   + kratak_opis added');
  } catch (e: any) {
    console.log(`   - kratak_opis: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS usluge TEXT`;
    console.log('   + usluge added');
  } catch (e: any) {
    console.log(`   - usluge: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)`;
    console.log('   + logo_url added');
  } catch (e: any) {
    console.log(`   - logo_url: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS kontakt_form_aktivna BOOLEAN DEFAULT false`;
    console.log('   + kontakt_form_aktivna added');
  } catch (e: any) {
    console.log(`   - kontakt_form_aktivna: ${e.message}`);
  }

  // =============================================
  // company_directory: Claim & Invite fields
  // =============================================
  console.log('\nStep 2: Adding claim & invite fields to company_directory...');

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP`;
    console.log('   + claimed_at added');
  } catch (e: any) {
    console.log(`   - claimed_at: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS claimed_by_company_id INTEGER`;
    console.log('   + claimed_by_company_id added');
  } catch (e: any) {
    console.log(`   - claimed_by_company_id: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMP`;
    console.log('   + invite_sent_at added');
  } catch (e: any) {
    console.log(`   - invite_sent_at: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64)`;
    console.log('   + invite_token added');
  } catch (e: any) {
    console.log(`   - invite_token: ${e.message}`);
  }

  // Index on invite_token for quick lookups
  try {
    await sql`CREATE INDEX IF NOT EXISTS cd_invite_token_idx ON company_directory (invite_token) WHERE invite_token IS NOT NULL`;
    console.log('   + invite_token index created');
  } catch (e: any) {
    console.log(`   - invite_token index: ${e.message}`);
  }

  // =============================================
  // agencies: Premium features
  // =============================================
  console.log('\nStep 3: Adding premium fields to agencies...');

  try {
    await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false`;
    console.log('   + is_premium added');
  } catch (e: any) {
    console.log(`   - is_premium: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS premium_since TIMESTAMP`;
    console.log('   + premium_since added');
  } catch (e: any) {
    console.log(`   - premium_since: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS max_clients INTEGER DEFAULT 10`;
    console.log('   + max_clients added');
  } catch (e: any) {
    console.log(`   - max_clients: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS featured_order INTEGER`;
    console.log('   + featured_order added');
  } catch (e: any) {
    console.log(`   - featured_order: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS banner_url VARCHAR(500)`;
    console.log('   + banner_url added');
  } catch (e: any) {
    console.log(`   - banner_url: ${e.message}`);
  }

  try {
    await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS social_links TEXT`;
    console.log('   + social_links added');
  } catch (e: any) {
    console.log(`   - social_links: ${e.message}`);
  }

  // =============================================
  // Verification
  // =============================================
  console.log('\nVerification: Checking new columns...\n');

  const cdCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'company_directory'
      AND column_name IN ('kratak_opis', 'usluge', 'logo_url', 'kontakt_form_aktivna', 'claimed_at', 'claimed_by_company_id', 'invite_sent_at', 'invite_token')
    ORDER BY ordinal_position
  `;
  console.log('company_directory new columns:');
  for (const col of cdCols) {
    console.log(`   ${col.column_name} (${col.data_type})`);
  }

  const agCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'agencies'
      AND column_name IN ('is_premium', 'premium_since', 'max_clients', 'featured_order', 'banner_url', 'social_links')
    ORDER BY ordinal_position
  `;
  console.log('\nagencies new columns:');
  for (const col of agCols) {
    console.log(`   ${col.column_name} (${col.data_type})`);
  }

  const expectedCd = 8;
  const expectedAg = 6;
  if (cdCols.length === expectedCd && agCols.length === expectedAg) {
    console.log(`\nAll ${expectedCd + expectedAg} new columns verified!`);
  } else {
    console.log(`\nWarning: Expected ${expectedCd} company_directory cols (got ${cdCols.length}), ${expectedAg} agency cols (got ${agCols.length})`);
  }

  console.log('\nMigration complete!');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
