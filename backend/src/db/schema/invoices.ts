import { pgTable, serial, varchar, text, timestamp, integer, date } from 'drizzle-orm/pg-core';
import { pricingTierEnum, billingCycleEnum } from './enums';

/**
 * Invoices Table
 *
 * Fakture za BZR Savetnik pretplate.
 * Izdavalac: NKNet Consulting DOO, PIB: 115190346
 * Redni broj: 11 cifara zero-padded / godina (kapacitet 99.999.999.999 godisnje)
 */
export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),

  // Redni broj fakture: "00000000001/2026"
  invoiceNumber: varchar('invoice_number', { length: 20 }).notNull().unique(),
  invoiceYear: integer('invoice_year').notNull(),

  // Kupac
  companyId: integer('company_id').notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  companyPib: varchar('company_pib', { length: 9 }).notNull(),
  companyAddress: varchar('company_address', { length: 500 }).notNull(),
  companyBankAccount: varchar('company_bank_account', { length: 50 }),

  // Stavke
  pricingTier: pricingTierEnum('pricing_tier').notNull(),
  billingCycle: billingCycleEnum('billing_cycle').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  amount: integer('amount').notNull(), // iznos u RSD (bez PDV-a)

  // Placanje
  pozivNaBroj: varchar('poziv_na_broj', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).default('issued').notNull(),
  // 'issued' -> 'paid' -> (ili 'cancelled')
  paidAt: timestamp('paid_at'),
  paymentNote: text('payment_note'),

  // PDF
  pdfFileKey: varchar('pdf_file_key', { length: 500 }),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
