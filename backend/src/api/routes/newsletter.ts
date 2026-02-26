/**
 * Newsletter tRPC Router
 *
 * Public subscribe/unsubscribe + admin campaign management.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc/builder';
import { newsletterService } from '../../services/newsletter.service';

export const newsletterRouter = router({
  /**
   * Subscribe to newsletter (public)
   */
  subscribe: publicProcedure
    .input(z.object({
      email: z.string().email(),
      ime: z.string().optional(),
      tip: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return newsletterService.subscribe(input.email, input.ime, input.tip);
    }),

  /**
   * Unsubscribe by token (public)
   */
  unsubscribe: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return newsletterService.unsubscribe(input.token);
    }),

  /**
   * Get subscriber count (admin)
   */
  subscriberCount: protectedProcedure
    .query(async () => {
      return { count: await newsletterService.getSubscriberCount() };
    }),

  /**
   * List subscribers (admin)
   */
  listSubscribers: protectedProcedure
    .input(z.object({
      tip: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return newsletterService.listSubscribers(input?.tip);
    }),

  /**
   * Create a campaign (admin)
   */
  createCampaign: protectedProcedure
    .input(z.object({
      naslov: z.string().min(1),
      sadrzaj: z.string().min(1),
      tipPrimaoca: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return newsletterService.createCampaign({
        naslov: input.naslov,
        sadrzaj: input.sadrzaj,
        tipPrimaoca: input.tipPrimaoca,
        createdBy: ctx.userId,
      });
    }),

  /**
   * List campaigns (admin)
   */
  listCampaigns: protectedProcedure
    .query(async () => {
      return newsletterService.listCampaigns();
    }),

  /**
   * Send a campaign (admin)
   */
  sendCampaign: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }) => {
      return newsletterService.sendCampaign(input.campaignId);
    }),
});
