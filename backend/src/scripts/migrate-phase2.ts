/**
 * Phase 2 Migration Script
 *
 * Creates the company_directory, message_threads, and messages tables
 * along with indexes, enum, and foreign key constraints.
 *
 * Usage: npx tsx src/scripts/migrate-phase2.ts
 */

import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function migrate() {
  console.log('Running Phase 2 migration...\n');

  // 1. Create message_sender_type enum
  await sql.unsafe(`
    DO $$ BEGIN
      CREATE TYPE "message_sender_type" AS ENUM('agency', 'company');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log('  [1/6] Created message_sender_type enum');

  // 2. Create company_directory table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "company_directory" (
      "id" serial PRIMARY KEY NOT NULL,
      "maticni_broj" varchar(8) NOT NULL,
      "poslovno_ime" varchar(500) NOT NULL,
      "pravna_forma" varchar(255),
      "sifra_delatnosti" varchar(10),
      "opstina" varchar(255),
      "sifra_opstine" varchar(10),
      "datum_osnivanja" varchar(20),
      "status" varchar(100),
      "datum_preseka_apr" timestamp,
      "adresa" varchar(500),
      "postanski_broj" varchar(10),
      "grad" varchar(100),
      "telefon" varchar(100),
      "email" varchar(255),
      "web_sajt" varchar(500),
      "ime_vlasnika" varchar(255),
      "prezime_vlasnika" varchar(255),
      "kontakt_osoba" varchar(255),
      "broj_zaposlenih" integer,
      "registrovan" boolean DEFAULT false,
      "datum_registracije" timestamp,
      "pretplata" varchar(50),
      "pretplata_aktivna" boolean DEFAULT false,
      "pretplata_do" timestamp,
      "backlink_aktivan" boolean DEFAULT false,
      "telefon_vidljiv" boolean DEFAULT false,
      "email_vidljiv" boolean DEFAULT false,
      "bzr_agencija_id" integer,
      "bzr_agencija_naziv" varchar(255),
      "bzr_saradnja" varchar(50),
      "napomena" text,
      "enriched_at" timestamp,
      "enrichment_source" varchar(50),
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "company_directory_maticni_broj_unique" UNIQUE("maticni_broj")
    );
  `);
  console.log('  [2/6] Created company_directory table');

  // 3. Create message_threads table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "message_threads" (
      "id" serial PRIMARY KEY NOT NULL,
      "agency_id" integer NOT NULL,
      "company_id" integer NOT NULL,
      "subject" varchar(500) NOT NULL,
      "last_message_at" timestamp DEFAULT now() NOT NULL,
      "last_message_preview" varchar(200),
      "unread_by_agency" integer DEFAULT 0 NOT NULL,
      "unread_by_company" integer DEFAULT 0 NOT NULL,
      "is_archived_by_agency" boolean DEFAULT false NOT NULL,
      "is_archived_by_company" boolean DEFAULT false NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  console.log('  [3/6] Created message_threads table');

  // 4. Create messages table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "messages" (
      "id" serial PRIMARY KEY NOT NULL,
      "thread_id" integer NOT NULL,
      "sender_type" "message_sender_type" NOT NULL,
      "sender_agency_id" integer,
      "sender_company_id" integer,
      "sender_name" varchar(255) NOT NULL,
      "content" text NOT NULL,
      "is_read" boolean DEFAULT false NOT NULL,
      "read_at" timestamp,
      "email_sent" boolean DEFAULT false NOT NULL,
      "email_sent_at" timestamp,
      "created_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  console.log('  [4/6] Created messages table');

  // 5. Create indexes
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "cd_sifra_delatnosti_idx" ON "company_directory" ("sifra_delatnosti")`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "cd_sifra_opstine_idx" ON "company_directory" ("sifra_opstine")`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "cd_opstina_idx" ON "company_directory" ("opstina")`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "cd_registrovan_idx" ON "company_directory" ("registrovan")`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "cd_bzr_agencija_id_idx" ON "company_directory" ("bzr_agencija_id")`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "mt_agency_id_idx" ON "message_threads" ("agency_id")`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "mt_company_id_idx" ON "message_threads" ("company_id")`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "mt_last_message_at_idx" ON "message_threads" ("last_message_at")`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "msg_thread_id_idx" ON "messages" ("thread_id")`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS "msg_created_at_idx" ON "messages" ("created_at")`);
  console.log('  [5/6] Created 10 indexes');

  // 6. Add foreign keys (skip if referenced table doesn't exist)
  const existingTables = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tableNames = new Set(existingTables.map(t => t.tablename));

  if (tableNames.has('agencies')) {
    await sql.unsafe(`
      DO $$ BEGIN
        ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_agency_id_agencies_id_fk"
          FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    console.log('  [6a/6] Added message_threads -> agencies FK');
  } else {
    console.log('  [6a/6] Skipped message_threads -> agencies FK (agencies table not yet created)');
  }

  if (tableNames.has('companies')) {
    await sql.unsafe(`
      DO $$ BEGIN
        ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_company_id_companies_id_fk"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    console.log('  [6b/6] Added message_threads -> companies FK');
  } else {
    console.log('  [6b/6] Skipped message_threads -> companies FK (companies table not yet created)');
  }

  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk"
        FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  console.log('  [6c/6] Added messages -> message_threads FK (cascade delete)');

  // Verify
  const tables = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('company_directory', 'message_threads', 'messages')
    ORDER BY tablename
  `;
  console.log('\nVerification:');
  console.log('  Tables created:', tables.map(t => t.tablename).join(', '));

  const cdCount = await sql`SELECT count(*)::int as count FROM company_directory`;
  console.log('  company_directory rows:', cdCount[0].count);

  const mtCount = await sql`SELECT count(*)::int as count FROM message_threads`;
  console.log('  message_threads rows:', mtCount[0].count);

  const msgCount = await sql`SELECT count(*)::int as count FROM messages`;
  console.log('  messages rows:', msgCount[0].count);

  await sql.end();
  console.log('\nPhase 2 migration complete!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
