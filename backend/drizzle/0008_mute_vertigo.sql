CREATE TABLE IF NOT EXISTS "client_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer,
	"naziv" varchar(500) NOT NULL,
	"tip" varchar(100) NOT NULL,
	"opis" text,
	"file_key" varchar(500) NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_size" integer,
	"mime_type" varchar(100),
	"ai_processed" boolean DEFAULT false,
	"ai_extracted_data" jsonb,
	"ai_processed_at" timestamp,
	"worker_id" integer,
	"position_id" integer,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_workflow" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer,
	"tip_dokumenta" varchar(200) NOT NULL,
	"naziv" varchar(500) NOT NULL,
	"status" varchar(50) DEFAULT 'nedostaju_podaci',
	"nedostajuci_podaci" jsonb,
	"generisan_file_key" varchar(500),
	"generisan_at" timestamp,
	"potreban_potpis" varchar(100),
	"potpisao_ime" varchar(255),
	"potpisan_at" timestamp,
	"conversation_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "esaw_classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tabela_broj" integer NOT NULL,
	"tabela_naziv" varchar(500) NOT NULL,
	"kod" varchar(20) NOT NULL,
	"naziv" varchar(500) NOT NULL,
	"roditelj_kod" varchar(20),
	"nivo" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_dangerous_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"naziv_materije" varchar(500) NOT NULL,
	"hemijski_naziv" varchar(500),
	"cas_broj" varchar(50),
	"klasa_opasnosti" varchar(255),
	"kolicina" varchar(255),
	"lokacija" varchar(500),
	"bezbednosni_list" boolean DEFAULT false,
	"datum_nabavke" date,
	"rok_upotrebe" date,
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_electrical_inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"vrsta_instalacije" varchar(255) NOT NULL,
	"lokacija" varchar(500),
	"datum_pregleda" date,
	"vrsio_pregleda" varchar(255),
	"rezultat" varchar(100),
	"zapisnik_broj" varchar(100),
	"sledeci_pregled" date,
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_environment_tests" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"vrsta_ispitivanja" varchar(255) NOT NULL,
	"lokacija" varchar(500),
	"datum_ispitivanja" date,
	"vrsio_ispitivanja" varchar(255),
	"izmerena_vrednost" varchar(255),
	"dozvoljen_gran_vrednost" varchar(255),
	"rezultat" varchar(100),
	"zapisnik_broj" varchar(100),
	"sledeci_pregled" date,
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_equipment_inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"naziv_opreme" varchar(500) NOT NULL,
	"vrsta_opreme" varchar(255),
	"lokacija" varchar(500),
	"datum_pregleda" date,
	"vrsio_pregleda" varchar(255),
	"rezultat" varchar(100),
	"zapisnik_broj" varchar(100),
	"sledeci_pregled" date,
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_hazard_exposure" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"ime_i_prezime" varchar(255) NOT NULL,
	"jmbg" varchar(13),
	"radno_mesto" varchar(500),
	"vrsta_stetnosti" varchar(500),
	"naziv_stetnosti" varchar(500),
	"nivo_izlozenosti" varchar(255),
	"trajanje_izlozenosti" varchar(255),
	"merenje_datum" date,
	"merenje_rezultat" varchar(500),
	"lekarski_nadzor" varchar(255),
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_high_risk_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"naziv_radnog_mesta" varchar(500) NOT NULL,
	"opis_poslova" text,
	"opasnosti_i_stetnosti" text,
	"mera_zastite" text,
	"broj_zaposlenih" integer,
	"datum_utvrdjivanja" date,
	"akt_procene_rizika_ref" varchar(255),
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_high_risk_workers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"ime_i_prezime" varchar(255) NOT NULL,
	"jmbg" varchar(13),
	"naziv_radnog_mesta" varchar(500) NOT NULL,
	"datum_rasporeda" date,
	"lekarski_pregled" varchar(255),
	"datum_pregleda" date,
	"osposobljen" boolean DEFAULT false,
	"datum_osposobljavanja" date,
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_occupational_diseases" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"ime_i_prezime" varchar(255) NOT NULL,
	"jmbg" varchar(13),
	"radno_mesto" varchar(500),
	"dijagnoza" varchar(500),
	"mkb_sifra" varchar(20),
	"datum_dijagnoze" date,
	"uzrocnik" varchar(500),
	"staz" integer,
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_ppe_issuance" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"ime_i_prezime" varchar(255) NOT NULL,
	"radno_mesto" varchar(500),
	"naziv_sredstva" varchar(500) NOT NULL,
	"vrsta_sredstva" varchar(255),
	"datum_izdavanja" date,
	"rok_trajanja" date,
	"datum_zamene" date,
	"potpis_primio" boolean DEFAULT false,
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_work_injuries" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"redni_broj" integer NOT NULL,
	"ime_i_prezime" varchar(255) NOT NULL,
	"jmbg" varchar(13),
	"radno_mesto" varchar(500),
	"datum_povrede" date NOT NULL,
	"vreme_povrede" varchar(10),
	"mesto_povrede" varchar(500),
	"opis_povrede" text,
	"povredjeni_deo_tela" varchar(255),
	"vrsta_povrede" varchar(255),
	"izvor_povrede" varchar(255),
	"uzrok_povrede" varchar(255),
	"tezina_povrede" varchar(50),
	"bolesnicko_odsustvo" integer,
	"esaw_kodovi" jsonb,
	"izvestaj_id" integer,
	"napomena" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_obligations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer,
	"tip" varchar(100) NOT NULL,
	"opis" varchar(500) NOT NULL,
	"worker_id" integer,
	"worker_name" varchar(255),
	"rok_datum" date NOT NULL,
	"pravni_osnov" varchar(500),
	"status" varchar(50) DEFAULT 'aktivan',
	"notifikovano_dana_30" boolean DEFAULT false,
	"notifikovano_dana_7" boolean DEFAULT false,
	"notifikovano_dana_1" boolean DEFAULT false,
	"notifikovano_isteklo" boolean DEFAULT false,
	"source_table" varchar(100),
	"source_record_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "injury_report_distribution" (
	"id" serial PRIMARY KEY NOT NULL,
	"injury_report_id" integer NOT NULL,
	"primalac" varchar(100) NOT NULL,
	"datum_slanja" date,
	"datum_prijema" date,
	"napomena" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "injury_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"poslodavac_naziv" varchar(500),
	"poslodavac_pib" varchar(9),
	"poslodavac_maticni_broj" varchar(8),
	"poslodavac_delatnost" varchar(255),
	"poslodavac_adresa" varchar(500),
	"poslodavac_mesto" varchar(255),
	"poslodavac_telefon" varchar(50),
	"ime_i_prezime" varchar(255) NOT NULL,
	"jmbg" varchar(13),
	"pol" varchar(1),
	"datum_rodjenja" date,
	"drzavljanstvo" varchar(100),
	"adresa_zaposlenog" varchar(500),
	"radno_mesto" varchar(500),
	"vrsta_radnog_odnosa" varchar(255),
	"staz_ukupno" varchar(50),
	"staz_na_radnom_mestu" varchar(50),
	"strucna_sprema" varchar(100),
	"zanimanje" varchar(255),
	"datum_povrede" date NOT NULL,
	"vreme_povrede" varchar(10),
	"smena" varchar(50),
	"sat_rada_kada_povredjen" varchar(20),
	"mesto_povrede" varchar(500),
	"opis_dogadjaja" text,
	"sta_je_radio_kada_povredjen" text,
	"kako_doslo_do_povrede" text,
	"esaw_radni_status" varchar(20),
	"esaw_zanimanje" varchar(20),
	"esaw_delatnost_poslodavca" varchar(20),
	"esaw_vrsta_radnog_mesta" varchar(20),
	"esaw_radno_okruzenje" varchar(20),
	"esaw_radni_proces" varchar(20),
	"esaw_specificna_aktivnost" varchar(20),
	"esaw_odstupanje" varchar(20),
	"esaw_nacin_povredjivanja" varchar(20),
	"esaw_materijalni_uzrocnik_odstupanja" varchar(20),
	"esaw_materijalni_uzrocnik_povredjivanja" varchar(20),
	"esaw_povredjeni_deo_tela" varchar(20),
	"esaw_vrsta_povrede" varchar(20),
	"esaw_dodatni_kodovi" jsonb,
	"tezina_povrede" varchar(50),
	"dijagnoza" text,
	"povredjeni_deo_tela" varchar(255),
	"vrsta_povrede_opis" varchar(255),
	"bolesnicko_odsustvo" integer,
	"invalidnost" boolean DEFAULT false,
	"smrtni_ishod" boolean DEFAULT false,
	"datum_smrtnog_ishoda" date,
	"svedoci" jsonb,
	"osposobljen_za_bzr" boolean,
	"lekarski_pregled" boolean,
	"sredstva_lzs" boolean,
	"uputstvo_za_rad" boolean,
	"sastavio_izvestaj" varchar(255),
	"datum_sastavljanja" date,
	"status" varchar(50) DEFAULT 'draft',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "newsletter_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"naslov" varchar(500) NOT NULL,
	"sadrzaj" text NOT NULL,
	"tip_primaoca" varchar(50),
	"status" varchar(50) DEFAULT 'draft',
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"ukupno_poslato" integer DEFAULT 0,
	"ukupno_otvoreno" integer DEFAULT 0,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"ime" varchar(255),
	"tip" varchar(50),
	"user_id" integer,
	"subscribed_at" timestamp DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp,
	"unsubscribe_token" varchar(100),
	"is_active" boolean DEFAULT true,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_workflow" ADD CONSTRAINT "document_workflow_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_workflow" ADD CONSTRAINT "document_workflow_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_dangerous_materials" ADD CONSTRAINT "evidence_dangerous_materials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_dangerous_materials" ADD CONSTRAINT "evidence_dangerous_materials_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_electrical_inspections" ADD CONSTRAINT "evidence_electrical_inspections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_electrical_inspections" ADD CONSTRAINT "evidence_electrical_inspections_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_environment_tests" ADD CONSTRAINT "evidence_environment_tests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_environment_tests" ADD CONSTRAINT "evidence_environment_tests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_equipment_inspections" ADD CONSTRAINT "evidence_equipment_inspections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_equipment_inspections" ADD CONSTRAINT "evidence_equipment_inspections_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_hazard_exposure" ADD CONSTRAINT "evidence_hazard_exposure_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_hazard_exposure" ADD CONSTRAINT "evidence_hazard_exposure_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_high_risk_positions" ADD CONSTRAINT "evidence_high_risk_positions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_high_risk_positions" ADD CONSTRAINT "evidence_high_risk_positions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_high_risk_workers" ADD CONSTRAINT "evidence_high_risk_workers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_high_risk_workers" ADD CONSTRAINT "evidence_high_risk_workers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_occupational_diseases" ADD CONSTRAINT "evidence_occupational_diseases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_occupational_diseases" ADD CONSTRAINT "evidence_occupational_diseases_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_ppe_issuance" ADD CONSTRAINT "evidence_ppe_issuance_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_ppe_issuance" ADD CONSTRAINT "evidence_ppe_issuance_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_work_injuries" ADD CONSTRAINT "evidence_work_injuries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_work_injuries" ADD CONSTRAINT "evidence_work_injuries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_obligations" ADD CONSTRAINT "legal_obligations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_obligations" ADD CONSTRAINT "legal_obligations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "injury_report_distribution" ADD CONSTRAINT "injury_report_distribution_injury_report_id_injury_reports_id_fk" FOREIGN KEY ("injury_report_id") REFERENCES "injury_reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "injury_reports" ADD CONSTRAINT "injury_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "injury_reports" ADD CONSTRAINT "injury_reports_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
