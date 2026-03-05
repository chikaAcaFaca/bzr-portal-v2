/**
 * Phase 3 Migration: PIB Auto-Lookup + Company Posts
 *
 * Run: npx tsx migrate-phase3.ts
 *
 * 1. Add pib column to company_directory
 * 2. Create company_posts table
 * 3. Populate pib from companies table where matching maticni_broj
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './src/db';

async function migrate() {
  console.log('🚀 Phase 3 Migration: Starting...\n');

  // 1. Add PIB column to company_directory
  console.log('1️⃣  Adding pib column to company_directory...');
  await db.execute(sql`
    ALTER TABLE company_directory ADD COLUMN IF NOT EXISTS pib VARCHAR(9)
  `);
  console.log('   ✅ pib column added');

  // 2. Create index on pib
  console.log('2️⃣  Creating index on pib...');
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS cd_pib_idx ON company_directory(pib)
  `);
  console.log('   ✅ cd_pib_idx created');

  // 3. Populate PIB from companies table where we have matching maticni_broj
  console.log('3️⃣  Populating pib from companies table...');
  const result = await db.execute(sql`
    UPDATE company_directory cd
    SET pib = c.pib
    FROM companies c
    WHERE cd.maticni_broj = c.maticni_broj AND c.pib IS NOT NULL AND cd.pib IS NULL
  `);
  console.log(`   ✅ Updated ${(result as any).rowCount ?? 'unknown'} rows with PIB from companies`);

  // 4. Create company_posts table
  console.log('4️⃣  Creating company_posts table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS company_posts (
      id SERIAL PRIMARY KEY,
      company_directory_id INTEGER NOT NULL REFERENCES company_directory(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL CHECK (type IN ('blog', 'ponuda', 'galerija')),
      title VARCHAR(500),
      content TEXT,
      image_url VARCHAR(500),
      is_published BOOLEAN DEFAULT true NOT NULL,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  console.log('   ✅ company_posts table created');

  // 5. Create indexes on company_posts
  console.log('5️⃣  Creating indexes on company_posts...');
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS cp_company_dir_id_idx ON company_posts(company_directory_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS cp_type_idx ON company_posts(type)
  `);
  console.log('   ✅ Indexes created');

  console.log('\n🎉 Phase 3 Migration: Complete!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
