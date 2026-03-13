import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc/builder';
import { db } from '../../db';
import { siteSettings } from '../../db/schema/site-settings';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

/**
 * Known site setting keys for type safety
 */
const SETTING_KEYS = [
  'social_facebook',
  'social_instagram',
  'social_youtube',
  'social_tiktok',
  'social_linkedin',
  'site_name',
  'site_description',
] as const;

export const siteSettingsRouter = router({
  /**
   * Get all public site settings (no auth required)
   * Used by public company profile pages to show default social links
   */
  getPublic: publicProcedure.query(async () => {
    const settings = await db.select().from(siteSettings);
    const result: Record<string, string> = {};
    for (const s of settings) {
      if (s.value) result[s.key] = s.value;
    }
    return result;
  }),

  /**
   * Get a single setting by key
   */
  get: publicProcedure
    .input(z.object({ key: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      const [setting] = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, input.key))
        .limit(1);
      return setting?.value ?? null;
    }),

  /**
   * Set/update a site setting (admin only)
   */
  set: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(100),
        value: z.string().max(2000).nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const [existing] = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, input.key))
        .limit(1);

      if (existing) {
        await db
          .update(siteSettings)
          .set({ value: input.value, updatedAt: new Date() })
          .where(eq(siteSettings.key, input.key));
      } else {
        await db.insert(siteSettings).values({
          key: input.key,
          value: input.value,
        });
      }

      return { success: true };
    }),

  /**
   * Bulk set multiple settings at once (admin only)
   */
  setBulk: protectedProcedure
    .input(
      z.object({
        settings: z.record(z.string().max(2000).nullable()),
      })
    )
    .mutation(async ({ input }) => {
      for (const [key, value] of Object.entries(input.settings)) {
        const [existing] = await db
          .select()
          .from(siteSettings)
          .where(eq(siteSettings.key, key))
          .limit(1);

        if (existing) {
          await db
            .update(siteSettings)
            .set({ value, updatedAt: new Date() })
            .where(eq(siteSettings.key, key));
        } else {
          await db.insert(siteSettings).values({ key, value });
        }
      }

      return { success: true };
    }),
});
