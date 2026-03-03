import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { rateLimiter } from 'hono-rate-limiter';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './api/trpc/router';
import { createContext } from './api/trpc/context';
import { db } from './db';
import { contactFormSubmissions } from './db/schema';
import { sendContactFormEmail } from './services/email.service';
import { initFirebaseAdmin } from './lib/firebase-admin';
import authRoutes from './routes/auth';
import documentUploadRoutes from './routes/document-upload';

// Initialize Firebase Admin SDK
initFirebaseAdmin();

/**
 * BZR Portal Backend Server
 *
 * Hono framework with tRPC integration for type-safe API.
 * Implements Serbian BZR law compliance requirements.
 */

const app = new Hono();

// Environment variables
const PORT = parseInt(process.env.PORT || '3000', 10);
const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173'];

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);

// Health check endpoint with optional DB test
app.get('/health', async (c) => {
  const result: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'BZR Portal Backend',
    version: '1.0.1',
    dbConfigured: !!process.env.DATABASE_URL,
  };

  // Test DB connection if ?db=1 is passed
  if (c.req.query('db') === '1') {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const [row] = await db.execute(sql`SELECT 1 as test`);
      result.db = 'connected';
      result.dbTest = row;
    } catch (err: unknown) {
      result.db = 'error';
      result.dbError = err instanceof Error ? {
        name: err.name,
        message: err.message,
        stack: err.stack?.split('\n').slice(0, 5),
      } : String(err);
    }
  }

  return c.json(result);
});

// Contact form endpoint (public, with rate limiting)
const contactLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Max 100 requests per window per IP
  standardHeaders: 'draft-6',
  keyGenerator: (c) => c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
});

app.post('/api/contact', contactLimiter, async (c) => {
  try {
    const body = await c.req.json();

    // Validation
    const { name, email, companyName, message, website } = body;

    // Honeypot check - reject if website field is filled (bot detection)
    if (website && website.trim() !== '') {
      return c.json({ success: false, error: 'Грешка при слању поруке. Покушајте поново.' }, 400);
    }

    // Required fields validation
    if (!name || name.trim().length === 0) {
      return c.json({ success: false, error: 'Име је обавезно' }, 400);
    }
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return c.json({ success: false, error: 'Email адреса није валидна' }, 400);
    }
    if (!message || message.trim().length < 10) {
      return c.json({ success: false, error: 'Порука мора имати најмање 10 карактера' }, 400);
    }

    // Length validation
    if (name.length > 255 || email.length > 255) {
      return c.json({ success: false, error: 'Име или email су предугачки' }, 400);
    }
    if (companyName && companyName.length > 255) {
      return c.json({ success: false, error: 'Назив компаније је предугачак' }, 400);
    }
    if (message.length > 5000) {
      return c.json({ success: false, error: 'Порука је предугачка (максимум 5000 карактера)' }, 400);
    }

    // Insert into database
    const [submission] = await db
      .insert(contactFormSubmissions)
      .values({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        companyName: companyName?.trim() || null,
        message: message.trim(),
        submittedAt: new Date(),
        status: 'new',
      })
      .returning();

    // Send email notification to support team
    const supportEmail = process.env.SUPPORT_EMAIL || 'info@bzrportal.rs';
    try {
      await sendContactFormEmail(supportEmail, {
        name: submission.name,
        email: submission.email,
        companyName: submission.companyName || undefined,
        message: submission.message,
        submittedAt: submission.submittedAt,
        submissionId: submission.id,
      });
    } catch (emailError) {
      console.error('Email send failed (submission saved):', emailError);
      // Don't fail the request if email fails - submission is in DB
    }

    return c.json({
      success: true,
      message: 'Порука је послата. Одговорићемо у року од 24 сата.',
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return c.json(
      {
        success: false,
        error: 'Грешка при слању поруке. Покушајте поново.',
      },
      500
    );
  }
});

// Static route registration (avoids Hono "matcher already built" error)
app.route('/api/auth', authRoutes);
console.log('✅ Auth routes enabled');

app.route('/api/documents', documentUploadRoutes);
console.log('✅ Document upload routes enabled');

// AI Chat routes (only if AI providers are configured)
const hasAIProviders =
  process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY;

if (hasAIProviders) {
  // Dynamic import kept for AI routes - only loaded if API keys are configured
  import('./routes/ai').then((module) => {
    app.route('/api/ai', module.default);
    console.log('✅ AI chat routes enabled');
  }).catch((error) => {
    console.error('⚠️  AI chat routes failed to load:', error);
  });
} else {
  console.log('ℹ️  AI chat routes disabled (no API keys configured)');

  app.get('/api/ai/*', (c) => {
    return c.json({
      success: false,
      error: 'AI chat is not configured on this server',
      message: 'Contact administrator to enable AI features',
    }, 503);
  });
}

// tRPC endpoint
app.all('/trpc/*', async (c) => {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext,
    onError({ error, path }) {
      console.error(`tRPC Error on ${path}:`, error);
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: 'Тражена рута не постоји',
      path: c.req.path,
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error('Server Error:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500
  );
});

// Start server
console.log(`🚀 BZR Portal Backend starting on port ${PORT}...`);

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`✅ Server running at http://localhost:${info.port}`);
    console.log(`📡 tRPC endpoint: http://localhost:${info.port}/trpc`);
    console.log(`💚 Health check: http://localhost:${info.port}/health`);
    console.log(`🌐 CORS origins: ${CORS_ORIGINS.join(', ')}`);
  }
);

export default app;
