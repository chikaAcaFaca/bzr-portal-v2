/**
 * Injury Reports Schema (Izvestaj o povredi na radu)
 *
 * Full injury report with 9 sections per Pravilnik 72/2006.
 * ESAW classification codes (19 tables) populated by AI or manually.
 * 5-copy distribution tracking (povredjeni, poslodavac, inspekcija, RFZO, sindikat).
 */

import { pgTable, serial, integer, varchar, text, timestamp, boolean, date, jsonb } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { agencies } from './agencies';

// ──────────────────────────────────────────────────────────────────────────────
// Full Injury Report (Izvestaj o povredi na radu)
// ──────────────────────────────────────────────────────────────────────────────
export const injuryReports = pgTable('injury_reports', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agencyId: integer('agency_id')
    .notNull()
    .references(() => agencies.id),

  // Section 1: Podaci o poslodavcu (employer)
  poslodavacNaziv: varchar('poslodavac_naziv', { length: 500 }),
  poslodavacPib: varchar('poslodavac_pib', { length: 9 }),
  poslodavacMaticniBroj: varchar('poslodavac_maticni_broj', { length: 8 }),
  poslodavacDelatnost: varchar('poslodavac_delatnost', { length: 255 }),
  poslodavacAdresa: varchar('poslodavac_adresa', { length: 500 }),
  poslodavacMesto: varchar('poslodavac_mesto', { length: 255 }),
  poslodavacTelefon: varchar('poslodavac_telefon', { length: 50 }),

  // Section 2: Podaci o povredjenom (injured worker)
  imeIPrezime: varchar('ime_i_prezime', { length: 255 }).notNull(),
  jmbg: varchar('jmbg', { length: 13 }),
  pol: varchar('pol', { length: 1 }), // M/Z
  datumRodjenja: date('datum_rodjenja'),
  drzavljanstvo: varchar('drzavljanstvo', { length: 100 }),
  adresaZaposlenog: varchar('adresa_zaposlenog', { length: 500 }),
  radnoMesto: varchar('radno_mesto', { length: 500 }),
  vrstaRadnogOdnosa: varchar('vrsta_radnog_odnosa', { length: 255 }),
  stazUkupno: varchar('staz_ukupno', { length: 50 }),
  stazNaRadnomMestu: varchar('staz_na_radnom_mestu', { length: 50 }),
  strucnaSprema: varchar('strucna_sprema', { length: 100 }),
  zanimanje: varchar('zanimanje', { length: 255 }),

  // Section 3: Podaci o povredi (injury details)
  datumPovrede: date('datum_povrede').notNull(),
  vremePovrede: varchar('vreme_povrede', { length: 10 }),
  smena: varchar('smena', { length: 50 }),
  satRadaKadaPovredjen: varchar('sat_rada_kada_povredjen', { length: 20 }),
  mestoPovrede: varchar('mesto_povrede', { length: 500 }),
  opisDogadjaja: text('opis_dogadjaja'),
  staJeRadioKadaPovredjen: text('sta_je_radio_kada_povredjen'),
  kakoDosloDoPotvrede: text('kako_doslo_do_povrede'),

  // Section 4: ESAW Classification Codes (Tabele 1-19)
  esawRadniStatus: varchar('esaw_radni_status', { length: 20 }),
  esawZanimanje: varchar('esaw_zanimanje', { length: 20 }),
  esawDelatnostPoslodavca: varchar('esaw_delatnost_poslodavca', { length: 20 }),
  esawVrstaRadnogMesta: varchar('esaw_vrsta_radnog_mesta', { length: 20 }),
  esawRadnoOkruzenje: varchar('esaw_radno_okruzenje', { length: 20 }),
  esawRadniProces: varchar('esaw_radni_proces', { length: 20 }),
  esawSpecificnaAktivnost: varchar('esaw_specificna_aktivnost', { length: 20 }),
  esawOdstupanje: varchar('esaw_odstupanje', { length: 20 }),
  esawNacinPovredjivanja: varchar('esaw_nacin_povredjivanja', { length: 20 }),
  esawMaterijalniUzrocnikOdstupanja: varchar('esaw_materijalni_uzrocnik_odstupanja', { length: 20 }),
  esawMaterijalniUzrocnikPovredjivanja: varchar('esaw_materijalni_uzrocnik_povredjivanja', { length: 20 }),
  esawPovredjeniDeoTela: varchar('esaw_povredjeni_deo_tela', { length: 20 }),
  esawVrstaPovrede: varchar('esaw_vrsta_povrede', { length: 20 }),
  esawDodatniKodovi: jsonb('esaw_dodatni_kodovi'), // Tabele 14-19

  // Section 5: Posledice (consequences)
  tezinaPovrede: varchar('tezina_povrede', { length: 50 }), // laka/teska/smrtna
  dijagnoza: text('dijagnoza'),
  povredjeniDeoTela: varchar('povredjeni_deo_tela', { length: 255 }),
  vrstaPovrede: varchar('vrsta_povrede_opis', { length: 255 }),
  bolesnickoOdsustvo: integer('bolesnicko_odsustvo'), // days
  invalidnost: boolean('invalidnost').default(false),
  smrtniIshod: boolean('smrtni_ishod').default(false),
  datumSmrtnogIshoda: date('datum_smrtnog_ishoda'),

  // Section 6: Svedoci (witnesses)
  svedoci: jsonb('svedoci'), // [{imeIPrezime, adresa, kontakt}]

  // Section 7: Mere zastite (protective measures status)
  osposobljenZaBzr: boolean('osposobljen_za_bzr'),
  lekarskiPregled: boolean('lekarski_pregled'),
  sredstvaLzs: boolean('sredstva_lzs'),
  uputstvoZaRad: boolean('uputstvo_za_rad'),

  // Section 8: Distribution info
  sastavioIzvestaj: varchar('sastavio_izvestaj', { length: 255 }),
  datumSastavljanja: date('datum_sastavljanja'),

  // Status tracking
  status: varchar('status', { length: 50 }).default('draft'), // draft/submitted/distributed
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type InjuryReport = typeof injuryReports.$inferSelect;
export type NewInjuryReport = typeof injuryReports.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────────
// 5-copy distribution tracking
// ──────────────────────────────────────────────────────────────────────────────
export const injuryReportDistribution = pgTable('injury_report_distribution', {
  id: serial('id').primaryKey(),
  injuryReportId: integer('injury_report_id')
    .notNull()
    .references(() => injuryReports.id, { onDelete: 'cascade' }),
  primalac: varchar('primalac', { length: 100 }).notNull(),
  // 'povredjeni', 'poslodavac', 'inspekcija_rada', 'rfzo', 'sindikat'
  datumSlanja: date('datum_slanja'),
  datumPrijema: date('datum_prijema'),
  napomena: text('napomena'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type InjuryReportDistribution = typeof injuryReportDistribution.$inferSelect;
export type NewInjuryReportDistribution = typeof injuryReportDistribution.$inferInsert;
