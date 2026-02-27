// Export all schemas for Drizzle ORM

// Shared enums (must be first to avoid circular deps)
export * from './enums';

// Multi-tenant: Agencies & Billing
export * from './agencies';
export * from './agency-users';
export * from './subscriptions';
export * from './invoices';

// Core business data
export * from './hazards';
export * from './companies';
export * from './work-positions';
export * from './workers';
export * from './risk-assessments';
export * from './ppe';
export * from './training';
export * from './medical-exams';

// Authentication schemas (Phase 2.5 - migrating to Firebase Auth)
export * from './users';
export * from './sessions';
export * from './email-verification-tokens';
export * from './password-reset-tokens';

// AI Learning & Caching (Phase 3b)
export * from './ai-cache';

// Landing Page - Contact Form (Phase 6)
export * from './contact-form-submissions';

// AI Conversations & Templates (Phase AI)
export * from './conversations';

// Document Upload & AI Extraction
export * from './uploaded-documents';

// Knowledge Base: Regulations & News
export * from './regulations';
export * from './news';

// Phase 2: Marketplace & Lead Generation
export * from './company-directory';
export * from './messages';

// Phase 3: Evidence Management, Injury Reports & Newsletter
export * from './evidence-records';
export * from './injury-reports';
export * from './esaw-classifications';
export * from './client-documents';
export * from './newsletter';
