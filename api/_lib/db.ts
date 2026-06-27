import pg from 'pg';
const { Pool } = pg;

let pool: any = null;

export function getDb(): Pool {
  if (!pool) {
    const connStr = process.env.SUPABASE_URL || process.env.DATABASE_URL;
    if (!connStr) throw new Error('DATABASE_URL required');
    pool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function query(text: string, params?: any[]) {
  const db = getDb();
  const client = await db.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
