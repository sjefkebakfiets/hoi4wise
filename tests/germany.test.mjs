import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {available,applicable} from '../lib/rules.mjs';
const d=JSON.parse(fs.readFileSync(new URL('../content/guides.json',import.meta.url)));const r=d.routes.find(r=>r.id==='ger-basis');
test('Duitsland behoudt route en oude taak-id’s en is zonder DLC beschikbaar',()=>{
  for(const id of ['GER-opening','GER-strategy','GER-supply','GER-midyear','GER-agency'])assert(r.tasks.some(t=>t.id===id));
  assert(available(r.condition,{dlc:[],version:'1.19.4'}));assert(r.versions.includes('1.19.4'));assert.equal(r.sections.length,14);assert.equal(r.tasks.length,21);assert.equal(r.status,'partial');assert.equal(r.focusVerified,false);
});
test('Duitse operatie- en DLC-taken volgen expliciete voorwaarden',()=>{
  const ids=(date,choices=[],dlc=[])=>applicable(r.tasks,{date,choices},{dlc,version:'1.19.4'}).map(t=>t.id);
  assert(!ids('1936-01-01').includes('ger-1939-ready'));assert(ids('1939-07-01').includes('ger-1939-ready'));
  assert(!ids('1941-01-01').includes('ger-east-logistics'));assert(ids('1941-01-01',['ger-oostfront']).includes('ger-east-logistics'));
  assert(!ids('1940-01-01').includes('ger-invasion-check'));assert(ids('1940-01-01',['ger-zeeleeuw']).includes('ger-invasion-check'));
  assert(!ids('1936-01-01').includes('ger-got-options'));assert(ids('1936-01-01',[],['got']).includes('ger-got-options'));
  assert(!ids('1936-01-01').includes('GER-agency'));assert(ids('1936-01-01',[],['lar']).includes('GER-agency'));
});
