/**
 * Invoice Service
 *
 * Generates invoices (fakture) for BZR Savetnik subscriptions.
 * Issuer: NKNet Consulting DOO, PIB: 115190346
 * Payment: IPS QR code + printed payment slip (uplatnica)
 */

import { db } from '../db';
import { invoices } from '../db/schema/invoices';
import { companies } from '../db/schema/companies';
import { PRICING_TIERS } from '../db/schema/subscriptions';
import { NKNET_PAYMENT_INFO, generateIpsQrString } from '../lib/ips-qr';
import { sendInvoiceEmail } from './email.service';
import { eq, and, desc, sql } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/**
 * Generate the next invoice number for a given year.
 * Format: 00000000001/2026 (11 digits zero-padded / year)
 */
export async function generateInvoiceNumber(year: number): Promise<string> {
  const [result] = await db
    .select({ maxNumber: sql<string>`MAX(invoice_number)` })
    .from(invoices)
    .where(eq(invoices.invoiceYear, year));

  let nextSeq = 1;
  if (result?.maxNumber) {
    const currentSeq = parseInt(result.maxNumber.split('/')[0], 10);
    nextSeq = currentSeq + 1;
  }

  return `${String(nextSeq).padStart(11, '0')}/${year}`;
}

/**
 * Create an invoice for a company subscription
 */
export async function createInvoice(
  companyId: number,
  billingCycle: 'monthly' | 'annual'
): Promise<typeof invoices.$inferSelect> {
  // Fetch company data
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const tier = company.pricingTier as keyof typeof PRICING_TIERS | null;
  if (!tier || tier === 'agency') {
    throw new Error(`Company ${companyId} has no valid pricing tier`);
  }

  const tierInfo = PRICING_TIERS[tier];
  const amount = billingCycle === 'monthly' ? tierInfo.monthlyRsd : tierInfo.annualRsd;

  // Calculate period
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let periodEnd: Date;
  if (billingCycle === 'monthly') {
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month
  } else {
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 12, 0);
  }

  const periodLabel = billingCycle === 'monthly' ? 'mesecna' : 'godisnja';
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  const pozivNaBroj = `${companyId}-${month}${year}`;

  const invoiceNumber = await generateInvoiceNumber(now.getFullYear());

  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber,
      invoiceYear: now.getFullYear(),
      companyId,
      companyName: company.name,
      companyPib: company.pib,
      companyAddress: company.address || '',
      companyBankAccount: company.tekuciRacun || null,
      pricingTier: tier,
      billingCycle,
      periodStart: formatDateForDb(periodStart),
      periodEnd: formatDateForDb(periodEnd),
      description: `BZR Savetnik pretplata - ${tierInfo.label} (${periodLabel})`,
      amount,
      pozivNaBroj,
      status: 'issued',
    })
    .returning();

  return invoice;
}

/**
 * Generate a PDF invoice with IPS QR code and payment slip (uplatnica)
 */
export async function generateInvoicePdf(invoiceId: number): Promise<Buffer> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  // Generate IPS QR code string
  const ipsString = generateIpsQrString({
    racunPrimaoca: NKNET_PAYMENT_INFO.racunPrimaoca,
    nazivPrimaoca: NKNET_PAYMENT_INFO.nazivPrimaoca,
    iznos: invoice.amount,
    pozivNaBroj: invoice.pozivNaBroj,
    svrhaPlacanja: invoice.description,
    sifraPlacanja: NKNET_PAYMENT_INFO.sifraPlacanja,
  });

  // Generate QR code as PNG buffer
  const qrBuffer = await QRCode.toBuffer(ipsString, {
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });

  // Build PDF
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // margins

    // === HEADER ===
    doc.fontSize(18).font('Helvetica-Bold').text('FAKTURA', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica')
      .text(`Broj fakture: ${invoice.invoiceNumber}`, { align: 'center' });
    doc.text(`Datum izdavanja: ${formatDateSr(invoice.createdAt)}`, { align: 'center' });
    doc.moveDown(1);

    // === SEPARATOR ===
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(1);

    // === ISSUER (left) & BUYER (right) ===
    const topY = doc.y;

    // Issuer
    doc.fontSize(9).font('Helvetica-Bold').text('IZDAVALAC:', 50, topY);
    doc.font('Helvetica').fontSize(9);
    doc.text(NKNET_PAYMENT_INFO.fullName, 50, topY + 14);
    doc.text(`PIB: ${NKNET_PAYMENT_INFO.pib}`, 50, topY + 26);
    doc.text(`MB: ${NKNET_PAYMENT_INFO.mb}`, 50, topY + 38);
    doc.text(NKNET_PAYMENT_INFO.adresa, 50, topY + 50);
    doc.text(`Tekuci racun: ${NKNET_PAYMENT_INFO.racunPrimaoca}`, 50, topY + 62);
    doc.text(`(${NKNET_PAYMENT_INFO.banka})`, 50, topY + 74);

    // Buyer
    doc.fontSize(9).font('Helvetica-Bold').text('KUPAC:', 310, topY);
    doc.font('Helvetica').fontSize(9);
    doc.text(invoice.companyName, 310, topY + 14);
    doc.text(`PIB: ${invoice.companyPib}`, 310, topY + 26);
    doc.text(invoice.companyAddress || '', 310, topY + 38);
    if (invoice.companyBankAccount) {
      doc.text(`Tekuci racun: ${invoice.companyBankAccount}`, 310, topY + 50);
    }

    doc.y = topY + 95;

    // === SEPARATOR ===
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(1);

    // === TABLE HEADER ===
    const tableTop = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('R.br', 50, tableTop, { width: 35 });
    doc.text('Opis', 90, tableTop, { width: 250 });
    doc.text('Kol.', 345, tableTop, { width: 35, align: 'center' });
    doc.text('Cena (RSD)', 385, tableTop, { width: 75, align: 'right' });
    doc.text('Iznos (RSD)', 465, tableTop, { width: 80, align: 'right' });

    doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).stroke('#cccccc');

    // === TABLE ROW ===
    const rowY = tableTop + 20;
    doc.fontSize(9).font('Helvetica');
    doc.text('1', 50, rowY, { width: 35 });
    doc.text(invoice.description, 90, rowY, { width: 250 });
    doc.text('1', 345, rowY, { width: 35, align: 'center' });
    doc.text(formatRsd(invoice.amount), 385, rowY, { width: 75, align: 'right' });
    doc.text(formatRsd(invoice.amount), 465, rowY, { width: 80, align: 'right' });

    doc.moveTo(50, rowY + 18).lineTo(545, rowY + 18).stroke('#cccccc');

    // === TOTAL ===
    const totalY = rowY + 26;
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('UKUPNO:', 385, totalY, { width: 75, align: 'right' });
    doc.text(`${formatRsd(invoice.amount)} RSD`, 465, totalY, { width: 80, align: 'right' });

    doc.moveDown(1);
    doc.y = totalY + 30;

    // === NOTE ===
    doc.fontSize(8).font('Helvetica')
      .text('Napomena: Faktura je punovazna bez pecata i potpisa. Obveznik nije u sistemu PDV-a.', 50, doc.y, {
        width: pageWidth,
      });
    doc.moveDown(0.5);
    doc.text(`Period: ${formatDateSr(new Date(invoice.periodStart))} - ${formatDateSr(new Date(invoice.periodEnd))}`, 50, doc.y, {
      width: pageWidth,
    });

    doc.moveDown(1.5);

    // === SEPARATOR ===
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(1);

    // === IPS QR CODE ===
    doc.fontSize(12).font('Helvetica-Bold').text('Platite skeniranjem QR koda', { align: 'center' });
    doc.moveDown(0.5);

    const qrX = (doc.page.width - 200) / 2;
    doc.image(qrBuffer, qrX, doc.y, { width: 200 });
    doc.y += 210;

    doc.fontSize(8).font('Helvetica')
      .text('Skenirajte QR kod bankarskom aplikacijom na telefonu (IPS instant placanje)', { align: 'center' });

    doc.moveDown(1.5);

    // === UPLATNICA (Payment Slip) ===
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica-Bold').text('NALOG ZA UPLATU', { align: 'center' });
    doc.moveDown(0.5);

    const slipY = doc.y;
    doc.fontSize(9).font('Helvetica');

    const labelX = 55;
    const valueX = 180;
    let currentY = slipY;

    const addSlipRow = (label: string, value: string) => {
      doc.font('Helvetica-Bold').text(label, labelX, currentY, { width: 120 });
      doc.font('Helvetica').text(value, valueX, currentY, { width: 350 });
      currentY += 16;
    };

    addSlipRow('Uplatilac:', `${invoice.companyName}, ${invoice.companyAddress || ''}`);
    addSlipRow('Svrha uplate:', invoice.description);
    addSlipRow('Primalac:', `${NKNET_PAYMENT_INFO.fullName}, ${NKNET_PAYMENT_INFO.adresa}`);
    addSlipRow('Racun primaoca:', NKNET_PAYMENT_INFO.racunPrimaoca);
    addSlipRow('Iznos:', `${formatRsd(invoice.amount)},00 RSD`);
    addSlipRow('Poziv na broj:', invoice.pozivNaBroj);
    addSlipRow('Sifra placanja:', NKNET_PAYMENT_INFO.sifraPlacanja);

    doc.end();
  });
}

/**
 * Mark an invoice as paid and extend subscription
 */
export async function markAsPaid(
  invoiceId: number,
  paymentNote?: string
): Promise<void> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const now = new Date();

  // Update invoice status
  await db
    .update(invoices)
    .set({
      status: 'paid',
      paidAt: now,
      paymentNote: paymentNote || null,
      updatedAt: now,
    })
    .where(eq(invoices.id, invoiceId));

  // Extend company subscription
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, invoice.companyId))
    .limit(1);

  if (company) {
    // Calculate new subscription end date
    const currentPaidUntil = company.subscriptionPaidUntil
      ? new Date(company.subscriptionPaidUntil)
      : now;
    const baseDate = currentPaidUntil > now ? currentPaidUntil : now;

    let newPaidUntil: Date;
    if (invoice.billingCycle === 'annual') {
      newPaidUntil = new Date(baseDate);
      newPaidUntil.setFullYear(newPaidUntil.getFullYear() + 1);
    } else {
      newPaidUntil = new Date(baseDate);
      newPaidUntil.setMonth(newPaidUntil.getMonth() + 1);
    }

    await db
      .update(companies)
      .set({
        subscriptionPaidUntil: newPaidUntil,
        lastPaymentAt: now,
        accountTier: 'verified',
        updatedAt: now,
      })
      .where(eq(companies.id, invoice.companyId));
  }
}

/**
 * Generate monthly invoices for all active subscriptions.
 * Called on the 1st of each month via API or cron.
 */
export async function generateMonthlyInvoices(): Promise<{
  generated: number;
  errors: string[];
}> {
  // Find all companies with active subscriptions (not trial, not agency tier)
  const activeCompanies = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.isDeleted, false),
        sql`${companies.pricingTier} IS NOT NULL AND ${companies.pricingTier} != 'agency'`,
        sql`${companies.accountTier} != 'trial'`
      )
    );

  let generated = 0;
  const errors: string[] = [];

  for (const company of activeCompanies) {
    try {
      const cycle = company.billingCycle || 'monthly';
      const invoice = await createInvoice(company.id, cycle as 'monthly' | 'annual');
      await generateInvoicePdf(invoice.id);

      // Send email with invoice
      try {
        const email = company.ownerEmail || company.email;
        if (email) {
          await sendInvoiceEmail(invoice.id);
        }
      } catch (emailErr) {
        console.error(`Failed to send invoice email for company ${company.id}:`, emailErr);
      }

      generated++;
    } catch (err) {
      const msg = `Company ${company.id} (${company.name}): ${err instanceof Error ? err.message : 'Unknown error'}`;
      errors.push(msg);
      console.error(`Invoice generation failed - ${msg}`);
    }
  }

  return { generated, errors };
}

/**
 * List invoices for a company
 */
export async function listInvoices(companyId: number) {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.companyId, companyId))
    .orderBy(desc(invoices.createdAt));
}

/**
 * Get a single invoice by ID
 */
export async function getInvoice(invoiceId: number) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  return invoice || null;
}

// === Helpers ===

function formatDateForDb(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateSr(date: Date): string {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`;
}

function formatRsd(amount: number): string {
  return amount.toLocaleString('sr-RS');
}
