/**
 * Hazards tRPC Router (T056)
 *
 * Provides access to standardized Serbian BZR hazard codes.
 * Reference data (read-only, seeded from database).
 */

import { router, publicProcedure } from '../trpc/builder';
import { db } from '../../db';
import { hazardTypes } from '../../db/schema/hazards';
import { z } from 'zod';
import { eq, like, or } from 'drizzle-orm';

// =============================================================================
// Hazards Router
// =============================================================================

export const hazardsRouter = router({
  /**
   * List all hazard types
   *
   * Returns all 45+ standardized Serbian BZR hazard codes.
   * Useful for populating hazard selector UI.
   *
   * Input: { category?: string, search?: string }
   * Output: HazardType[]
   */
  list: publicProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          search: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const filters = [];

      // Filter by category if provided
      if (input?.category) {
        filters.push(eq(hazardTypes.category, input.category));
      }

      // Search in name if provided
      if (input?.search) {
        filters.push(
          or(
            like(hazardTypes.nameSr, `%${input.search}%`),
            like(hazardTypes.code, `%${input.search}%`)
          )!
        );
      }

      const hazards = await db.query.hazardTypes.findMany({
        where: filters.length > 0 ? (hazardTypes, { and }) => and(...filters) : undefined,
        orderBy: (hazardTypes, { asc }) => [asc(hazardTypes.category), asc(hazardTypes.code)],
      });

      return hazards;
    }),

  /**
   * Get hazard by ID
   *
   * Input: { id: number }
   * Output: HazardType | null
   */
  getById: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const hazard = await db.query.hazardTypes.findFirst({
        where: eq(hazardTypes.id, input.id),
      });

      return hazard || null;
    }),

  /**
   * Get hazard categories
   *
   * Returns unique list of categories for filtering.
   *
   * Input: none
   * Output: string[]
   */
  getCategories: publicProcedure.query(async () => {
    // Get distinct categories
    const hazards = await db.query.hazardTypes.findMany({
      orderBy: (hazardTypes, { asc }) => [asc(hazardTypes.category)],
    });

    const categories = Array.from(new Set(hazards.map((h) => h.category)));

    return categories;
  }),
});
