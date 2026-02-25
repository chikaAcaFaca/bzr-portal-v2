import { pgTable, serial, varchar, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';

/**
 * Company Directory Table
 *
 * 750k+ Serbian companies imported from APR open data API.
 * Separate from `companies` table (which holds registered platform users only).
 * Used for Lead Finder (agencies) and Public Company Profiles (SEO).
 */
export const companyDirectory = pgTable('company_directory', {
  id: serial('id').primaryKey(),

  // APR Core Data
  maticniBroj: varchar('maticni_broj', { length: 8 }).notNull().unique(),
  poslovnoIme: varchar('poslovno_ime', { length: 500 }).notNull(),
  pravnaForma: varchar('pravna_forma', { length: 255 }),
  sifraDelatnosti: varchar('sifra_delatnosti', { length: 10 }),
  opstina: varchar('opstina', { length: 255 }),
  sifraOpstine: varchar('sifra_opstine', { length: 10 }),
  datumOsnivanja: varchar('datum_osnivanja', { length: 20 }),
  status: varchar('status', { length: 100 }),
  datumPresekaApr: timestamp('datum_preseka_apr'),

  // Enriched Data (from APR scraping)
  adresa: varchar('adresa', { length: 500 }),
  postanskiBroj: varchar('postanski_broj', { length: 10 }),
  grad: varchar('grad', { length: 100 }),
  telefon: varchar('telefon', { length: 100 }),
  email: varchar('email', { length: 255 }),
  webSajt: varchar('web_sajt', { length: 500 }),
  imeVlasnika: varchar('ime_vlasnika', { length: 255 }),
  prezimeVlasnika: varchar('prezime_vlasnika', { length: 255 }),
  kontaktOsoba: varchar('kontakt_osoba', { length: 255 }),
  brojZaposlenih: integer('broj_zaposlenih'),

  // Platform integration
  registrovan: boolean('registrovan').default(false),
  datumRegistracije: timestamp('datum_registracije'),
  pretplata: varchar('pretplata', { length: 50 }),
  pretplataAktivna: boolean('pretplata_aktivna').default(false),
  pretplataDo: timestamp('pretplata_do'),
  backlinkAktivan: boolean('backlink_aktivan').default(false),
  telefonVidljiv: boolean('telefon_vidljiv').default(false),
  emailVidljiv: boolean('email_vidljiv').default(false),

  // BZR relationship
  bzrAgencijaId: integer('bzr_agencija_id'),
  bzrAgencijaNaziv: varchar('bzr_agencija_naziv', { length: 255 }),
  bzrSaradnja: varchar('bzr_saradnja', { length: 50 }),
  napomena: text('napomena'),

  // Enrichment tracking
  enrichedAt: timestamp('enriched_at'),
  enrichmentSource: varchar('enrichment_source', { length: 50 }),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  sifraDelatnostiIdx: index('cd_sifra_delatnosti_idx').on(table.sifraDelatnosti),
  sifraOpstineIdx: index('cd_sifra_opstine_idx').on(table.sifraOpstine),
  opstinaIdx: index('cd_opstina_idx').on(table.opstina),
  registrovanIdx: index('cd_registrovan_idx').on(table.registrovan),
  bzrAgencijaIdIdx: index('cd_bzr_agencija_id_idx').on(table.bzrAgencijaId),
}));

export type CompanyDirectoryEntry = typeof companyDirectory.$inferSelect;
export type NewCompanyDirectoryEntry = typeof companyDirectory.$inferInsert;
