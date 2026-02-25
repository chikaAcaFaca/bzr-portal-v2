import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  console.log('Existing tables:');
  tables.forEach(t => console.log(' ', t.tablename));
  console.log(`\nTotal: ${tables.length} tables`);
  await sql.end();
}

main();
