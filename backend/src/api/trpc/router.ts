/**
 * tRPC App Router
 *
 * Assembles all feature routers into the main app router.
 * Builder functions are exported from ./builder.ts to avoid circular dependencies.
 */

import { router, publicProcedure } from './builder';
import { authRouter } from '../routes/auth';
import { companiesRouter } from '../routes/companies';
import { positionsRouter } from '../routes/positions';
import { workersRouter } from '../routes/workers';
import { risksRouter } from '../routes/risks';
import { documentsRouter } from '../routes/documents';
import { hazardsRouter } from '../routes/hazards';
import { agenciesRouter } from '../routes/agencies';
import { companyDirectoryRouter } from '../routes/company-directory';
import { messagingRouter } from '../routes/messaging';
import { evidenceRouter } from '../routes/evidence';
import { documentWorkflowRouter } from '../routes/document-workflow';
import { injuryReportsRouter } from '../routes/injury-reports';
import { newsletterRouter } from '../routes/newsletter';

// Re-export builder functions for convenience
export { router, publicProcedure, protectedProcedure, companyOwnerProcedure } from './builder';

/**
 * App Router
 *
 * Combines all feature routers.
 */
export const appRouter = router({
  // Health check
  health: publicProcedure.query(() => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }),

  // Feature routers (Phase 3 MVP)
  auth: authRouter,
  companies: companiesRouter,
  positions: positionsRouter,
  workers: workersRouter,
  risks: risksRouter,
  documents: documentsRouter,
  hazards: hazardsRouter,
  agencies: agenciesRouter,

  // Phase 2: Marketplace & Lead Generation
  companyDirectory: companyDirectoryRouter,
  messaging: messagingRouter,

  // Phase 3: Evidence Management, Injury Reports & Newsletter
  evidence: evidenceRouter,
  documentWorkflow: documentWorkflowRouter,
  injuryReports: injuryReportsRouter,
  newsletter: newsletterRouter,
});

export type AppRouter = typeof appRouter;
