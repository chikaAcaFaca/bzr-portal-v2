import { router, protectedProcedure, companyOwnerProcedure } from '../trpc/builder';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { db } from '../../db';
import { companies } from '../../db/schema/companies';
import { PRICING_TIERS } from '../../db/schema/subscriptions';
import { NKNET_PAYMENT_INFO } from '../../lib/ips-qr';
import {
  listInvoices,
  getInvoice,
  generateInvoicePdf,
  createInvoice,
  markAsPaid,
  generateMonthlyInvoices,
} from '../../services/invoice.service';
import { sendInvoiceEmail } from '../../services/email.service';
import { eq, and } from 'drizzle-orm';

/**
 * Billing tRPC Router
 *
 * Handles invoices, payments, and subscription billing.
 */
export const billingRouter = router({
  /**
   * List invoices for the current company owner
   */
  listInvoices: companyOwnerProcedure.query(async ({ ctx }) => {
    return listInvoices(ctx.companyOwnerId);
  }),

  /**
   * Get a single invoice (company owner only sees own invoices)
   */
  getInvoice: companyOwnerProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const invoice = await getInvoice(input.invoiceId);
      if (!invoice || invoice.companyId !== ctx.companyOwnerId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Faktura nije pronadjena' });
      }
      return invoice;
    }),

  /**
   * Download invoice PDF
   */
  downloadPdf: companyOwnerProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await getInvoice(input.invoiceId);
      if (!invoice || invoice.companyId !== ctx.companyOwnerId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Faktura nije pronadjena' });
      }

      const pdfBuffer = await generateInvoicePdf(input.invoiceId);
      return {
        pdf: pdfBuffer.toString('base64'),
        filename: `faktura-${invoice.invoiceNumber.replace('/', '-')}.pdf`,
      };
    }),

  /**
   * Mark invoice as paid (admin/agency only)
   */
  markPaid: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      paymentNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Only admins or agency users can mark invoices as paid
      if (!ctx.agencyId && !ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate dozvolu' });
      }

      await markAsPaid(input.invoiceId, input.paymentNote);
      return { success: true };
    }),

  /**
   * Generate monthly invoices (admin only)
   */
  generateMonthly: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Require agency user or admin
      if (!ctx.agencyId && !ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate dozvolu' });
      }

      const result = await generateMonthlyInvoices();
      return result;
    }),

  /**
   * Manually create an invoice (admin)
   */
  createManual: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      billingCycle: z.enum(['monthly', 'annual']),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.agencyId && !ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate dozvolu' });
      }

      const invoice = await createInvoice(input.companyId, input.billingCycle);
      return invoice;
    }),

  /**
   * Get payment info for current company (QR code data)
   */
  paymentInfo: companyOwnerProcedure.query(async ({ ctx }) => {
    const [company] = await db
      .select({
        id: companies.id,
        name: companies.name,
        pricingTier: companies.pricingTier,
        billingCycle: companies.billingCycle,
        employeeCount: companies.employeeCount,
        accountTier: companies.accountTier,
        trialExpiryDate: companies.trialExpiryDate,
        subscriptionPaidUntil: companies.subscriptionPaidUntil,
        lastPaymentAt: companies.lastPaymentAt,
      })
      .from(companies)
      .where(eq(companies.id, ctx.companyOwnerId))
      .limit(1);

    if (!company) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Firma nije pronadjena' });
    }

    const tier = company.pricingTier as keyof typeof PRICING_TIERS | null;
    const tierInfo = tier ? PRICING_TIERS[tier] : null;
    const monthlyPrice = tierInfo?.monthlyRsd ?? 0;
    const annualPrice = tierInfo?.annualRsd ?? 0;

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());
    const pozivNaBroj = `${company.id}-${month}${year}`;

    let status: 'trial' | 'active' | 'expired' = 'trial';
    if (company.subscriptionPaidUntil && company.subscriptionPaidUntil > now) {
      status = 'active';
    } else if (company.trialExpiryDate && company.trialExpiryDate < now) {
      status = 'expired';
    }

    return {
      companyId: company.id,
      companyName: company.name,
      pricingTier: company.pricingTier,
      tierLabel: tierInfo?.label ?? 'Nepoznat paket',
      monthlyPrice,
      annualPrice,
      pozivNaBroj,
      status,
      trialExpiryDate: company.trialExpiryDate,
      subscriptionPaidUntil: company.subscriptionPaidUntil,
      lastPaymentAt: company.lastPaymentAt,
      // Payment details for QR code
      racunPrimaoca: NKNET_PAYMENT_INFO.racunPrimaoca,
      nazivPrimaoca: NKNET_PAYMENT_INFO.nazivPrimaoca,
      sifraPlacanja: NKNET_PAYMENT_INFO.sifraPlacanja,
    };
  }),

  /**
   * List invoices for agency clients
   */
  listAgencyInvoices: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.agencyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Niste deo nijedne agencije' });
      }

      // Verify company belongs to this agency
      const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.id, input.companyId), eq(companies.agencyId, ctx.agencyId)))
        .limit(1);

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Klijent nije pronadjen' });
      }

      return listInvoices(input.companyId);
    }),

  /**
   * Send invoice email
   */
  sendInvoiceEmail: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.agencyId && !ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Nemate dozvolu' });
      }

      await sendInvoiceEmail(input.invoiceId);
      return { success: true };
    }),
});
