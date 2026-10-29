import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { openStore } from '../lib/store.mjs';

test('PostgreSQL-configuratie is verplicht', async () => {
  await assert.rejects(openStore({}), /PostgreSQL ontbreekt/);
});

test('PostgreSQL: migraties, ronde-trip, validatie en persistentie na serverherstart', {
  skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL ontbreekt; echte PostgreSQL-integratietest draait in GitHub Actions',
}, async () => {
  const schema = 'hoi4wise_test_' + process.pid + '_' + Date.now();
  const admin = new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', '-c search_path=' + schema);
  const scopedUrl = url.toString();
  let proc;
  const base = 'http://127.0.0.1:' + (Number(process.env.TEST_PORT) || 18372);
  async function start() {
    proc = spawn(process.execPath, ['server.mjs'], {
      env:{...process.env, PORT:String(Number(process.env.TEST_PORT) || 18372), DATABASE_URL:scopedUrl}, stdio:'ignore',
    });
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
      if (proc.exitCode !== null) throw Error('Server stopte tijdens opstarten');
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Server start mislukt');
  }
  async function stop() {
    if (!proc || proc.exitCode !== null) return;
    const done = new Promise(r => proc.once('exit', r));
    proc.kill(); await done;
  }
  try {
    await admin.query('CREATE SCHEMA ' + schema);
    // Twee gelijktijdige instanties mogen dezelfde migratie maar één keer toepassen.
    const stores = await Promise.all([openStore({DATABASE_URL:scopedUrl}), openStore({DATABASE_URL:scopedUrl})]);
    await Promise.all(stores.map(s => s.close()));
    const migrations = await admin.query('SELECT count(*)::int AS n FROM ' + schema + '.app_migrations');
    assert.equal(migrations.rows[0].n, 1);
    await start();
    const empty = await fetch(base + '/api/state').then(r => r.json());
    assert.deepEqual(empty.campaigns, []);
    const state = {profile:{dlc:['lar'],version:'1.19.3'},favorites:['GER'],campaigns:[{id:'test',name:'Test',country:'GER',route:'ger-basis',date:'1936-07-01',done:['GER-opening'],notes:"Bewaar mijn notities: '日本'",choices:[]}]};
    let r = await fetch(base + '/api/state', {method:'PUT',body:JSON.stringify(state)});
    assert.equal(r.status, 200);
    await stop(); await start();
    assert.deepEqual(await fetch(base + '/api/state').then(r => r.json()), state);
    r = await fetch(base + '/api/state', {method:'PUT',body:JSON.stringify({...state,campaigns:[{...state.campaigns[0],country:'BAD'}]})});
    assert.equal(r.status, 400);
    r = await fetch(base + '/api/state', {method:'PUT',body:'broken json'});
    assert.equal(r.status, 400);
    r = await fetch(base + '/api/state', {method:'PUT',headers:{Origin:'https://evil.example'},body:JSON.stringify(state)});
    assert.equal(r.status, 403);
    assert.deepEqual(await fetch(base + '/api/state').then(r => r.json()), state);
    assert.equal((await fetch(base + '/manifest.webmanifest')).status, 200);
    assert.equal((await fetch(base + '/sw.js')).status, 200);
  } finally {
    await stop();
    // Alleen het unieke testschema opruimen, nooit bestaande appdata.
    await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await admin.end();
  }
});
