import fs from 'node:fs/promises';
import pg from 'pg';
import {USERS,hashPassword} from './auth.mjs';

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
    async load(username,initial) { const { rows } = await pool.query('SELECT value FROM user_state WHERE username = $1',[username]); return rows[0]?.value ?? structuredClone(initial); },
    async save(username,state) { await pool.query('INSERT INTO user_state(username, value) VALUES ($1, $2::jsonb) ON CONFLICT(username) DO UPDATE SET value = excluded.value', [username,JSON.stringify(state)]); },
    async initializeUsers(env) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(4192027)');
        const {rows}=await client.query('SELECT username FROM app_users WHERE password_hash IS NULL');
        for(const {username} of rows){
          const hash=await hashPassword(env[username.toUpperCase()+'_PASSWORD']);
          await client.query('UPDATE app_users SET password_hash=$1 WHERE username=$2',[hash,username]);
        }
        await client.query('COMMIT');
      } catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
    },
    async user(username){return (await pool.query('SELECT username,password_hash FROM app_users WHERE username=$1',[username])).rows[0]},
    async createSession(hash,username){
      await pool.query('DELETE FROM app_sessions WHERE expires_at <= now()');
      await pool.query("INSERT INTO app_sessions(token_hash,username,expires_at) VALUES($1,$2,now()+interval '7 days')",[hash,username]);
    },
    async session(hash){return (await pool.query('SELECT username FROM app_sessions WHERE token_hash=$1 AND expires_at>now()',[hash])).rows[0]?.username},
    async deleteSession(hash){await pool.query('DELETE FROM app_sessions WHERE token_hash=$1',[hash])},
    async resetPassword(username,password){
      if(!USERS.includes(username))throw Error('Onbekende gebruiker');
      const hash=await hashPassword(password);const c=await pool.connect();
      try{await c.query('BEGIN');await c.query('UPDATE app_users SET password_hash=$1 WHERE username=$2',[hash,username]);await c.query('DELETE FROM app_sessions WHERE username=$1',[username]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
    },
    async deleteCampaign(username,id){
      const result=await pool.query(`UPDATE user_state SET value=jsonb_set(value,'{campaigns}',COALESCE((SELECT jsonb_agg(c) FROM jsonb_array_elements(value->'campaigns') AS c WHERE c->>'id' <> $2),'[]'::jsonb)) WHERE username=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(value->'campaigns') AS c WHERE c->>'id'=$2) RETURNING username`,[username,id]);
      return result.rowCount>0;
    },
    async healthy() { await pool.query('SELECT 1'); },
    async close() { await pool.end(); },
  };
}
