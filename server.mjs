import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {validateImport} from './lib/rules.mjs';
import {openStore} from './lib/store.mjs';
import {startupMessage} from './lib/startup.mjs';
import {hashPassword,verifyPassword,newToken,tokenHash} from './lib/auth.mjs';
const initial={profile:{dlc:[],version:'1.19.4',level:'beginner'},campaigns:[],favorites:[]};
const content=JSON.parse(fs.readFileSync('content/guides.json'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
let store,stage='database';
try{store=await openStore();stage='accounts';await store.initializeUsers(process.env)}catch(error){
  console.error(startupMessage(error,stage));
  await store?.close();process.exit(1);
}
const dummyHash=await hashPassword(newToken());
const failures=new Map();
const secureCookie=process.env.COOKIE_SECURE==='true';
function cookie(value,clear=false){return `hoi4wise_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:604800}${secureCookie?'; Secure':''}`}
function requestToken(req){return /(?:^|;\s*)hoi4wise_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie||'')?.[1]}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
async function body(req,max){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(Error(),{status:413});chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(Error(),{status:400})}}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'");
  try{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
    if(u.pathname==='/api/health'){try{await store.healthy();return res.end('ok')}catch{return json(res,503,{error:'Database niet beschikbaar'})}}
    if(['POST','PUT','DELETE'].includes(req.method)&&((req.headers.origin&&!['http://'+req.headers.host,'https://'+req.headers.host].includes(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site'))return json(res,403,{error:'Aanvraag geweigerd'});
    if(u.pathname==='/api/login'){
      if(req.method!=='POST')return json(res,405,{error:'Methode niet toegestaan'});
      const ip=req.socket.remoteAddress;const now=Date.now();
      for(const [key,value]of failures)if(value.until<=now)failures.delete(key);
      const attempt=failures.get(ip)||{count:0,until:now+900000};
      if(attempt.count>=10){res.setHeader('Retry-After',String(Math.ceil((attempt.until-now)/1000)));return json(res,429,{error:'Te veel pogingen. Probeer over 15 minuten opnieuw.'})}
      const input=await body(req,4096);if(!input||typeof input!=='object'||Array.isArray(input))return json(res,400,{error:'Ongeldige aanvraag'});const name=typeof input.username==='string'?input.username.toLowerCase().trim():'';
      const user=await store.user(name);
      const valid=await verifyPassword(input.password,user?.password_hash||dummyHash);
      if(!valid||!user){attempt.count++;failures.set(ip,attempt);return json(res,401,{error:'Gebruikersnaam of wachtwoord onjuist'})}
      failures.delete(ip);
      const old=requestToken(req);if(old)await store.deleteSession(tokenHash(old));
      const token=newToken();await store.createSession(tokenHash(token),name);
      res.setHeader('Set-Cookie',cookie(token));return json(res,200,{username:name});
    }
    if(u.pathname.startsWith('/api/')){
      const token=requestToken(req);const username=token?await store.session(tokenHash(token)):undefined;
      if(!username)return json(res,401,{error:'Log opnieuw in'});
      if(u.pathname==='/api/session'&&req.method==='GET')return json(res,200,{username});
      if(req.headers['x-hoi4wise-user']!==username)return json(res,409,{error:'Account gewisseld. Log opnieuw in.'});
      if(u.pathname==='/api/logout'&&req.method==='POST'){
        await store.deleteSession(tokenHash(token));res.setHeader('Set-Cookie',cookie('',true));return json(res,200,{ok:true});
      }
      if(u.pathname==='/api/state'){
        if(req.method==='GET')return json(res,200,await store.load(username,initial));
        if(req.method!=='PUT')return json(res,405,{error:'Methode niet toegestaan'});
        const state=await body(req,2000000);
        try{
          validateImport({format:1,campaigns:state.campaigns});
          if(!Array.isArray(state.profile?.dlc)||typeof state.profile.version!=='string'||!Array.isArray(state.favorites))throw Error();
          for(const c of state.campaigns)if(!content.countries.some(n=>n.id===c.country)||!content.routes.some(r=>r.id===c.route&&r.country===c.country))throw Error();
        }catch{return json(res,400,{error:'Ongeldige campagnegegevens'})}
        await store.save(username,state);return json(res,200,{});
      }
      if(u.pathname.startsWith('/api/campaigns/')&&req.method==='DELETE'){
        const id=decodeURIComponent(u.pathname.slice('/api/campaigns/'.length));
        // Eén SQL-update binnen de eigenaar voorkomt het terugschrijven van andermans data.
        const deleted=await store.deleteCampaign(username,id);
        return json(res,deleted?200:404,deleted?{ok:true}:{error:'Campagne niet gevonden'});
      }
      return json(res,404,{error:'Niet gevonden'});
    }
    const f=path.resolve(u.pathname==='/content.json'?'content/guides.json':u.pathname==='/rules.js'?'lib/rules.mjs':path.join('public',u.pathname==='/'?'index.html':decodeURIComponent(u.pathname)));
    if(!f.startsWith(path.resolve('public')+path.sep)&&!['content/guides.json','lib/rules.mjs'].some(x=>f===path.resolve(x))){res.writeHead(403);return res.end()}
    if(!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end('Niet gevonden')}
    res.setHeader('Content-Type',u.pathname==='/rules.js'?'text/javascript':types[path.extname(f)]||'application/octet-stream');
    if(u.pathname==='/sw.js'||u.pathname==='/'||u.pathname==='/app.js'||u.pathname==='/rules.js')res.setHeader('Cache-Control','no-cache');
    res.end(fs.readFileSync(f));
  }catch(e){json(res,e.status||503,{error:e.status===413?'Bestand te groot':e.status===400?'Ongeldige aanvraag':'Opslag tijdelijk niet beschikbaar. Probeer opnieuw.'})}
});
server.listen(Number(process.env.PORT)||3000,'0.0.0.0');
let stopping=false;async function shutdown(){if(stopping)return;stopping=true;const timer=setTimeout(()=>process.exit(1),10000);timer.unref();server.close(async()=>{await store.close();clearTimeout(timer)})}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
