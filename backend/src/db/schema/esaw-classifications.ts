/**
 * ESAW Classifications Schema
 *
 * European Statistics on Accidents at Work (ESAW) classification codes.
 * 19 tables used for standardized injury report coding.
 * Seeded via scripts/seed-esaw-tables.ts with official codes.
 */

import { pgTable, serial, integer, varchar } from 'drizzle-orm/pg-core';

export const esawClassifications = pgTable('esaw_classifications', {
  id: serial('id').primaryKey(),
  tabelaBroj: integer('tabela_broj').notNull(), // 1-19
  tabelaNaziv: varchar('tabela_naziv', { length: 500 }).notNull(),
  kod: varchar('kod', { length: 20 }).notNull(),
  naziv: varchar('naziv', { length: 500 }).notNull(),
  roditeljKod: varchar('roditelj_kod', { length: 20 }),
  nivo: integer('nivo').default(1), // hierarchy level
});

export type EsawClassification = typeof esawClassifications.$inferSelect;
export type NewEsawClassification = typeof esawClassifications.$inferInsert;
