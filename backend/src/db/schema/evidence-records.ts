/**
 * Evidence Records Schema (Obrazac 1-11)
 *
 * Per Pravilnik o nacinu vodjenja i rokovima cuvanja evidencija u oblasti BZR
 * (Sl. glasnik RS, br. 5/2025, 38/2025, 118/2025) - effective July 1, 2026
 *
 * Replaces old Pravilnik (62/2007). 11 forms instead of 14.
 * Obrazac 6 (Evidencija o osposobljavanju) is skipped - must remain paper-based.
 */

import { pgTable, serial, integer, varchar, text, timestamp, boolean, date, jsonb } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { agencies } from './agencies';

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 1: Evidencija o radnim mestima sa povecenim rizikom
// ──────────────────────────────────────────────────────────────────────────────
export const evidenceHighRiskPositions = pgTable('evidence_high_risk_positions', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  nazivRadnogMesta: varchar('naziv_radnog_mesta', { length: 500 }).notNull(),
  opisPoslova: text('opis_poslova'),
  opasnostiIStetnosti: text('opasnosti_i_stetnosti'), // JSON array of hazards
  meraZastite: text('mera_zastite'), // JSON array of protective measures
  brojZaposlenih: integer('broj_zaposlenih'),
  datumUtvrdjivanja: date('datum_utvrdjivanja'),
  aktProceneRizikaRef: varchar('akt_procene_rizika_ref', { length: 255 }),
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidenceHighRiskPosition = typeof evidenceHighRiskPositions.$inferSelect;
export type NewEvidenceHighRiskPosition = typeof evidenceHighRiskPositions.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 2: Evidencija o zaposlenima rasporedjenim na radna mesta sa povecenim rizikom
// ──────────────────────────────────────────────────────────────────────────────
export const evidenceHighRiskWorkers = pgTable('evidence_high_risk_workers', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  imeIPrezime: varchar('ime_i_prezime', { length: 255 }).notNull(),
  jmbg: varchar('jmbg', { length: 13 }),
  nazivRadnogMesta: varchar('naziv_radnog_mesta', { length: 500 }).notNull(),
  datumRasporeda: date('datum_rasporeda'),
  lekarskiPregled: varchar('lekarski_pregled', { length: 255 }),
  datumPregleda: date('datum_pregleda'),
  osposobljen: boolean('osposobljen').default(false),
  datumOsposobljavanja: date('datum_osposobljavanja'),
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidenceHighRiskWorker = typeof evidenceHighRiskWorkers.$inferSelect;
export type NewEvidenceHighRiskWorker = typeof evidenceHighRiskWorkers.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 3: Evidencija o povredama na radu
// ──────────────────────────────────────────────────────────────────────────────
export const evidenceWorkInjuries = pgTable('evidence_work_injuries', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  imeIPrezime: varchar('ime_i_prezime', { length: 255 }).notNull(),
  jmbg: varchar('jmbg', { length: 13 }),
  radnoMesto: varchar('radno_mesto', { length: 500 }),
  datumPovrede: date('datum_povrede').notNull(),
  vremePovrede: varchar('vreme_povrede', { length: 10 }),
  mestoPovrede: varchar('mesto_povrede', { length: 500 }),
  opisPovrede: text('opis_povrede'),
  povredjeniDeoTela: varchar('povredjeni_deo_tela', { length: 255 }),
  vrstaPovrede: varchar('vrsta_povrede', { length: 255 }),
  izvorPovrede: varchar('izvor_povrede', { length: 255 }),
  uzrokPovrede: varchar('uzrok_povrede', { length: 255 }),
  tezinaPovrede: varchar('tezina_povrede', { length: 50 }), // laka/teska/smrtna
  bolesnickoOdsustvo: integer('bolesnicko_odsustvo'), // days
  esawKodovi: jsonb('esaw_kodovi'), // { tabela3: '...', tabela4: '...', ... }
  izvestajId: integer('izvestaj_id'),
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidenceWorkInjury = typeof evidenceWorkInjuries.$inferSelect;
export type NewEvidenceWorkInjury = typeof evidenceWorkInjuries.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 4: Evidencija o profesionalnim oboljenjima
// ──────────────────────────────────────────────────────────────────────────────
export const evidenceOccupationalDiseases = pgTable('evidence_occupational_diseases', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  imeIPrezime: varchar('ime_i_prezime', { length: 255 }).notNull(),
  jmbg: varchar('jmbg', { length: 13 }),
  radnoMesto: varchar('radno_mesto', { length: 500 }),
  dijagnoza: varchar('dijagnoza', { length: 500 }),
  mkbSifra: varchar('mkb_sifra', { length: 20 }), // ICD-10
  datumDijagnoze: date('datum_dijagnoze'),
  uzrocnik: varchar('uzrocnik', { length: 500 }),
  staz: integer('staz'), // years of exposure
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidenceOccupationalDisease = typeof evidenceOccupationalDiseases.$inferSelect;
export type NewEvidenceOccupationalDisease = typeof evidenceOccupationalDiseases.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 5: Evidencija o zaposlenima izlozenim biohemijskim stetnostima
// ──────────────────────────────────────────────────────────────────────────────
export const evidenceHazardExposure = pgTable('evidence_hazard_exposure', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  imeIPrezime: varchar('ime_i_prezime', { length: 255 }).notNull(),
  jmbg: varchar('jmbg', { length: 13 }),
  radnoMesto: varchar('radno_mesto', { length: 500 }),
  vrstaStetnosti: varchar('vrsta_stetnosti', { length: 500 }), // hemijska/bioloska/fizicka
  nazivStetnosti: varchar('naziv_stetnosti', { length: 500 }),
  nivoIzlozenosti: varchar('nivo_izlozenosti', { length: 255 }),
  trajanjeIzlozenosti: varchar('trajanje_izlozenosti', { length: 255 }),
  merenjeDatum: date('merenje_datum'),
  merenjeRezultat: varchar('merenje_rezultat', { length: 500 }),
  lekarskiNadzor: varchar('lekarski_nadzor', { length: 255 }),
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidenceHazardExposure = typeof evidenceHazardExposure.$inferSelect;
export type NewEvidenceHazardExposure = typeof evidenceHazardExposure.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 6: SKIP - Already implemented as paper form (Evidencija o osposobljavanju)
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 7: Evidencija o opasnim materijama
// ──────────────────────────────────────────────────────────────────────────────
export const evidenceDangerousMaterials = pgTable('evidence_dangerous_materials', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  nazivMaterije: varchar('naziv_materije', { length: 500 }).notNull(),
  hemijskiNaziv: varchar('hemijski_naziv', { length: 500 }),
  casBroj: varchar('cas_broj', { length: 50 }),
  klasaOpasnosti: varchar('klasa_opasnosti', { length: 255 }),
  kolicina: varchar('kolicina', { length: 255 }),
  lokacija: varchar('lokacija', { length: 500 }),
  bezbednosniList: boolean('bezbednosni_list').default(false),
  datumNabavke: date('datum_nabavke'),
  rokUpotrebe: date('rok_upotrebe'),
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidenceDangerousMaterial = typeof evidenceDangerousMaterials.$inferSelect;
export type NewEvidenceDangerousMaterial = typeof evidenceDangerousMaterials.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 8: Evidencija o izvrsenim pregledima i ispitivanjima opreme za rad
// ──────────────────────────────────────────────────────────────────────────────
export const evidenceEquipmentInspections = pgTable('evidence_equipment_inspections', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  nazivOpreme: varchar('naziv_opreme', { length: 500 }).notNull(),
  vrstaOpreme: varchar('vrsta_opreme', { length: 255 }),
  lokacija: varchar('lokacija', { length: 500 }),
  datumPregleda: date('datum_pregleda'),
  vrsioPregleda: varchar('vrsio_pregleda', { length: 255 }),
  rezultat: varchar('rezultat', { length: 100 }), // ispravan/neispravan
  zapisnikBroj: varchar('zapisnik_broj', { length: 100 }),
  sledeciPregled: date('sledeci_pregled'),
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidenceEquipmentInspection = typeof evidenceEquipmentInspections.$inferSelect;
export type NewEvidenceEquipmentInspection = typeof evidenceEquipmentInspections.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 9: Evidencija o izvrsenim pregledima i ispitivanjima elektricnih instalacija
// ──────────────────────────────────────────────────────────────────────────────
export const evidenceElectricalInspections = pgTable('evidence_electrical_inspections', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  vrstaInstalacije: varchar('vrsta_instalacije', { length: 255 }).notNull(),
  lokacija: varchar('lokacija', { length: 500 }),
  datumPregleda: date('datum_pregleda'),
  vrsioPregleda: varchar('vrsio_pregleda', { length: 255 }),
  rezultat: varchar('rezultat', { length: 100 }),
  zapisnikBroj: varchar('zapisnik_broj', { length: 100 }),
  sledeciPregled: date('sledeci_pregled'),
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidenceElectricalInspection = typeof evidenceElectricalInspections.$inferSelect;
export type NewEvidenceElectricalInspection = typeof evidenceElectricalInspections.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 10: Evidencija o izvrsenim ispitivanjima uslova radne okoline
// ──────────────────────────────────────────────────────────────────────────────
export const evidenceEnvironmentTests = pgTable('evidence_environment_tests', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  vrstaIspitivanja: varchar('vrsta_ispitivanja', { length: 255 }).notNull(), // buka/vibracije/osvetljenje/mikroklima/hemijski agensi
  lokacija: varchar('lokacija', { length: 500 }),
  datumIspitivanja: date('datum_ispitivanja'),
  vrsioIspitivanja: varchar('vrsio_ispitivanja', { length: 255 }),
  izmerenaVrednost: varchar('izmerena_vrednost', { length: 255 }),
  dozvoljenGranVrednost: varchar('dozvoljen_gran_vrednost', { length: 255 }),
  rezultat: varchar('rezultat', { length: 100 }), // zadovoljava/ne-zadovoljava
  zapisnikBroj: varchar('zapisnik_broj', { length: 100 }),
  sledeciPregled: date('sledeci_pregled'),
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidenceEnvironmentTest = typeof evidenceEnvironmentTests.$inferSelect;
export type NewEvidenceEnvironmentTest = typeof evidenceEnvironmentTests.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Obrazac 11: Evidencija o izdatim sredstvima i opremi za licnu zastitu na radu
// ──────────────────────────────────────────────────────────────────────────────
export const evidencePpeIssuance = pgTable('evidence_ppe_issuance', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),
  redniBroj: integer('redni_broj').notNull(),
  imeIPrezime: varchar('ime_i_prezime', { length: 255 }).notNull(),
  radnoMesto: varchar('radno_mesto', { length: 500 }),
  nazivSredstva: varchar('naziv_sredstva', { length: 500 }).notNull(),
  vrstaSredstva: varchar('vrsta_sredstva', { length: 255 }),
  datumIzdavanja: date('datum_izdavanja'),
  rokTrajanja: date('rok_trajanja'),
  datumZamene: date('datum_zamene'),
  potpisPrimio: boolean('potpis_primio').default(false),
  napomena: text('napomena'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EvidencePpeIssuance = typeof evidencePpeIssuance.$inferSelect;
export type NewEvidencePpeIssuance = typeof evidencePpeIssuance.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// Legal Obligations Tracker - covers ALL BZR deadlines
// ──────────────────────────────────────────────────────────────────────────────
export const legalObligations = pgTable('legal_obligations', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .references(() => agencies.id),
  tip: varchar('tip', { length: 100 }).notNull(),
  // 'lekarski_pregled', 'sanitarni_pregled', 'obuka_bzr', 'pregled_opreme',
  // 'ispitivanje_instalacija', 'ispitivanje_okoline', 'akt_procene_rizika',
  // 'osiguranje', 'licenca_obnova'
  opis: varchar('opis', { length: 500 }).notNull(),
  workerId: integer('worker_id'),
  workerName: varchar('worker_name', { length: 255 }),
  rokDatum: date('rok_datum').notNull(),
  pravniOsnov: varchar('pravni_osnov', { length: 500 }),
  status: varchar('status', { length: 50 }).default('aktivan'), // aktivan/zavrsen/istekao
  notifikovanoDana30: boolean('notifikovano_dana_30').default(false),
  notifikovanoDana7: boolean('notifikovano_dana_7').default(false),
  notifikovanoDana1: boolean('notifikovano_dana_1').default(false),
  notifikovanoIsteklo: boolean('notifikovano_isteklo').default(false),
  sourceTable: varchar('source_table', { length: 100 }),
  sourceRecordId: integer('source_record_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type LegalObligation = typeof legalObligations.$inferSelect;
export type NewLegalObligation = typeof legalObligations.$inferInsert;
