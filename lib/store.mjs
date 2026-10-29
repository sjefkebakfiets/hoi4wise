import fs from 'node:fs/promises';
import pg from 'pg';

export async function openStore(env = process.env) {
  if (!env.DATABASE_URL && (!env.PGHOST || !env.PGDATABASE || !env.PGUSER || !env.PGPASSWORD)) {
    throw new Error('PostgreSQL ontbreekt: stel PGHOST, PGDATABASE, PGUSER en PGPASSWORD in, of DATABASE_URL.');
  }
  const pool = new pg.Pool({
    ...(env.DATABASE_URL ? { connectionString: env.DATABASE_URL } : {
      host: env.PGHOST, port: Number(env.PGPORT || 5432),
      database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD,
    }),
    max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 15000,
    statement_timeout: 10000,
  });
  pool.on('error', () => console.error('PostgreSQL-verbinding verbroken; volgende aanvraag probeert opnieuw.'));
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(4192026)');
      await client.query('CREATE TABLE IF NOT EXISTS app_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      const files = (await fs.readdir(new URL('../migrations/', import.meta.url))).filter(f => /^\d{3}-.+\.sql$/.test(f)).sort();
      const { rows } = await client.query('SELECT id FROM app_migrations');
      if (rows.some(r => !files.includes(r.id))) throw new Error('Onbekende databasemigratie; gebruik een passende appversie.');
      for (const file of files) {
        if (rows.some(r => r.id === file)) continue;
        await client.query(await fs.readFile(new URL('../migrations/' + file, import.meta.url), 'utf8'));
        await client.query('INSERT INTO app_migrations (id) VALUES ($1)', [file]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } catch (error) { await pool.end(); throw error; }
  return {
    async load(initial) { const { rows } = await pool.query('SELECT value FROM state WHERE id = 1'); return rows[0]?.value ?? structuredClone(initial); },
    async save(state) { await pool.query('INSERT INTO state(id, value) VALUES (1, $1::jsonb) ON CONFLICT(id) DO UPDATE SET value = excluded.value', [JSON.stringify(state)]); },
    async healthy() { await pool.query('SELECT 1'); },
    async close() { await pool.end(); },
  };
}
