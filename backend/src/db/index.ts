import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create postgres client with SSL for Neon/cloud PostgreSQL
// prepare: false is required for Neon's connection pooler (PgBouncer)
const client = postgres(connectionString, {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
  prepare: false,
});

// Create drizzle instance with schema
export const db = drizzle(client, { schema });

// Export schema for use in other modules
export * from './schema';
