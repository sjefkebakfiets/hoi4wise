import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { validateImport } from './lib/rules.mjs';
import { openStore } from './lib/store.mjs';

const initial = {profile:{dlc:[],version:'1.19.3',level:'beginner'},campaigns:[],favorites:[]};
const content = JSON.parse(fs.readFileSync('content/guides.json'));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
let store;
try { store = await openStore(); }
catch (error) {
  console.error('PostgreSQL niet beschikbaar of migratie mislukt. Controleer databaseconfiguratie en bereikbaarheid.');
  // Never log connection URLs, passwords or raw driver errors.
  process.exit(1);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'");
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/health') {
    res.setHeader('Cache-Control', 'no-store');
    try { await store.healthy(); return res.end('ok'); }
    catch { res.writeHead(503); return res.end('Database niet beschikbaar'); }
  }
  try {
    if (u.pathname === '/api/state') {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') return res.end(JSON.stringify(await store.load(initial)));
      if (req.method !== 'PUT') { res.writeHead(405); return res.end(); }
      if (req.headers.origin && !['http://' + req.headers.host, 'https://' + req.headers.host].includes(req.headers.origin)) {
        res.writeHead(403); return res.end();
      }
      let body = '', bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 2000000) { res.writeHead(413); return res.end(); }
        body += chunk;
      }
      let state;
      try {
        state = JSON.parse(body);
        validateImport({format:1,campaigns:state.campaigns});
        if (!Array.isArray(state.profile?.dlc) || typeof state.profile.version !== 'string' || !Array.isArray(state.favorites)) throw Error();
        for (const c of state.campaigns) {
          if (!content.countries.some(n => n.id === c.country) || !content.routes.some(r => r.id === c.route && r.country === c.country)) throw Error();
        }
      } catch { res.writeHead(400); return res.end('{"error":"Ongeldige campagnegegevens"}'); }
      await store.save(state);
      return res.end('{}');
    }
    const f = path.resolve(u.pathname === '/content.json' ? 'content/guides.json' : u.pathname === '/rules.js' ? 'lib/rules.mjs' : path.join('public', u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname)));
    if (!f.startsWith(path.resolve('public') + path.sep) && !['content/guides.json', 'lib/rules.mjs'].some(x => f === path.resolve(x))) {
      res.writeHead(403); return res.end();
    }
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('Niet gevonden'); }
    res.setHeader('Content-Type', u.pathname === '/rules.js' ? 'text/javascript' : types[path.extname(f)] || 'application/octet-stream');
    if (u.pathname === '/sw.js') res.setHeader('Cache-Control', 'no-cache');
    res.end(fs.readFileSync(f));
  } catch {
    res.writeHead(503, {'Content-Type':'application/json'});
    res.end('{"error":"Opslag tijdelijk niet beschikbaar. Probeer opnieuw."}');
  }
});
server.listen(Number(process.env.PORT) || 3000, '0.0.0.0');
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  server.close(async () => { await store.close(); clearTimeout(timer); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
