import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {openStore} from '../lib/store.mjs';
import {hashPassword,verifyPassword,tokenHash} from '../lib/auth.mjs';

test('PostgreSQL-configuratie is verplicht',async()=>{await assert.rejects(openStore({}),/PostgreSQL ontbreekt/)});
test('Wachtwoorden hebben een salt, worden gehasht en worden correct gecontroleerd',async()=>{
  const password=randomBytes(20).toString('hex');const a=await hashPassword(password),b=await hashPassword(password);
  assert.notEqual(a,b);assert(!a.includes(password));assert(await verifyPassword(password,a));assert(!await verifyPassword('verkeerd-wachtwoord',a));
  await assert.rejects(hashPassword('kort'));assert(!await verifyPassword(password,'ongeldig'));assert.equal(tokenHash('x').length,64);
});
test('Accounts, migratie, toegangsscheiding, verwijderen en PostgreSQL-persistentie',{
  skip:!process.env.TEST_DATABASE_URL&&'TEST_DATABASE_URL ontbreekt; echte PostgreSQL-test draait in GitHub Actions',
},async()=>{
  const schema='hoi4wise_test_'+process.pid+'_'+Date.now();
  const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);const scopedUrl=url.toString();
  const passwords={ben:randomBytes(20).toString('hex'),robin:randomBytes(20).toString('hex'),erwin:randomBytes(20).toString('hex')};
  const env={DATABASE_URL:scopedUrl,BEN_PASSWORD:passwords.ben,ROBIN_PASSWORD:passwords.robin,ERWIN_PASSWORD:passwords.erwin};
  const base='http://127.0.0.1:'+(Number(process.env.TEST_PORT)||18372);let proc;
  const legacy={profile:{dlc:[],version:'1.19.3'},favorites:['GER'],campaigns:[{id:'legacy',country:'GER',route:'ger-basis',date:'1936-01-01',done:['GER-opening'],notes:'Bestaande campagne'}]};
  async function start(){
    proc=spawn(process.execPath,['server.mjs'],{env:{...process.env,...env,PORT:String(Number(process.env.TEST_PORT)||18372)},stdio:'ignore'});
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return}catch{}if(proc.exitCode!==null)throw Error('Server stopte tijdens opstarten');await new Promise(r=>setTimeout(r,100))}throw Error('Server start mislukt');
  }
  async function stop(){if(!proc||proc.exitCode!==null)return;const done=new Promise(r=>proc.once('exit',r));proc.kill();await done}
  async function login(name,password=passwords[name]){
    const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name,password})});
    assert.equal(r.status,200);const set=r.headers.get('set-cookie');assert(set.includes('HttpOnly'));assert(set.includes('SameSite=Strict'));return set.split(';')[0];
  }
  const api=(name,cookie,path='/api/state',options={})=>fetch(base+path,{...options,headers:{Cookie:cookie,'X-HOI4Wise-User':name,...options.headers}});
  try{
    await admin.query('CREATE SCHEMA '+schema);
    const setup=new pg.Client({connectionString:scopedUrl});await setup.connect();
    await setup.query('CREATE TABLE app_migrations(id TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    await setup.query(await fs.readFile(new URL('../migrations/001-initial.sql',import.meta.url),'utf8'));
    await setup.query("INSERT INTO app_migrations(id) VALUES('001-initial.sql')");
    await setup.query('INSERT INTO state(id,value) VALUES(1,$1)',[JSON.stringify(legacy)]);await setup.end();
    const stores=await Promise.all([openStore({DATABASE_URL:scopedUrl}),openStore({DATABASE_URL:scopedUrl})]);
    await assert.rejects(stores[0].initializeUsers({}));
    await Promise.all(stores.map(s=>s.initializeUsers(env)));
    assert.deepEqual(await stores[0].load('erwin',{}),legacy);
    assert.deepEqual(await stores[0].load('ben',{campaigns:[]}),{campaigns:[]});
    await Promise.all(stores.map(s=>s.close()));
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM '+schema+'.app_migrations')).rows[0].n,2);
    const hashes=(await admin.query('SELECT password_hash FROM '+schema+'.app_users')).rows;assert.equal(hashes.length,3);assert(hashes.every(x=>x.password_hash.startsWith('scrypt:')));
    await start();
    assert.equal((await fetch(base+'/api/state')).status,401);
    assert.equal((await fetch(base+'/api/campaigns/legacy',{method:'DELETE'})).status,401);
    let r=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'erwin',password:'onjuist'})});assert.equal(r.status,401);
    r=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'https://evil.example'},body:JSON.stringify({username:'erwin',password:passwords.erwin})});assert.equal(r.status,403);
    let erwin=await login('erwin');const ben=await login('ben'),robin=await login('robin');
    assert.deepEqual(await api('erwin',erwin).then(r=>r.json()),legacy);
    assert.deepEqual((await api('ben',ben).then(r=>r.json())).campaigns,[]);
    assert.deepEqual((await api('robin',robin).then(r=>r.json())).campaigns,[]);
    assert.equal((await api('erwin',ben)).status,409);
    const state={profile:{dlc:['lar'],version:'1.19.4'},favorites:['ROM'],campaigns:[{id:'test',name:'Duitsland',country:'GER',route:'ger-basis',date:'1941-01-01',done:['GER-opening'],notes:"Bewaar mijn notities: '日本'",choices:['ger-oostfront']},{id:'rom-test',name:'Roemenië',country:'ROM',route:'rom-historical-1936',date:'1941-01-01',done:['rom-start-audit'],notes:'Roemeense voortgang',choices:['rom-oostfront']}]};
    assert.equal((await api('erwin',erwin,'/api/state',{method:'PUT',body:JSON.stringify(state)})).status,200);
    assert.equal((await api('ben',ben,'/api/campaigns/test',{method:'DELETE'})).status,404);
    assert.equal((await api('erwin',ben,'/api/campaigns/test',{method:'DELETE'})).status,409);
    await stop();await start();
    assert.deepEqual(await api('erwin',erwin).then(r=>r.json()),state);
    assert.deepEqual((await api('ben',ben).then(r=>r.json())).campaigns,[]);
    const benState={...state,campaigns:[{...state.campaigns[0],id:'ben-test',notes:'Alleen ben'}]};
    assert.equal((await api('ben',ben,'/api/state',{method:'PUT',body:JSON.stringify(benState)})).status,200);
    r=await api('erwin',erwin,'/api/state',{method:'PUT',body:JSON.stringify({...state,campaigns:[{...state.campaigns[0],country:'BAD'}]})});assert.equal(r.status,400);
    assert.equal((await api('erwin',erwin,'/api/state',{method:'PUT',body:'broken'})).status,400);
    assert.equal((await api('erwin',erwin,'/api/campaigns/test',{method:'DELETE'})).status,200);
    assert.equal((await api('erwin',erwin,'/api/campaigns/test',{method:'DELETE'})).status,404);
    assert.equal((await api('erwin',erwin).then(r=>r.json())).campaigns.length,1);
    assert.deepEqual(await api('ben',ben).then(r=>r.json()),benState);
    assert.equal((await api('erwin',erwin,'/api/logout',{method:'POST'})).status,200);
    assert.equal((await api('erwin',erwin)).status,401);
    erwin=await login('erwin');
    await stop();await start();assert.equal((await api('erwin',erwin).then(r=>r.json())).campaigns[0].id,'rom-test');
    const reset=await openStore({DATABASE_URL:scopedUrl});const newPassword=randomBytes(20).toString('hex');await reset.resetPassword('erwin',newPassword);await reset.close();
    assert.equal((await api('erwin',erwin)).status,401);
    await login('erwin',newPassword);
    assert.equal((await fetch(base+'/manifest.webmanifest')).status,200);
    assert.equal((await fetch(base+'/sw.js')).status,200);
    // Verkeerde wachtwoorden moeten uiteindelijk tijdelijk worden begrensd.
    for(let i=0;i<10;i++){const failed=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'ben',password:'verkeerd-wachtwoord'})});assert.equal(failed.status,401)}
    assert.equal((await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'ben',password:passwords.ben})})).status,429);
  }finally{await stop();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end()}
});
