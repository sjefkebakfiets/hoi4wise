import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const d=JSON.parse(fs.readFileSync(new URL('../content/guides.json',import.meta.url)));const root=new URL('../public/',import.meta.url);
test('Roemeense screenshots hebben bestaande lokale bestanden, bron en inhoudelijke context',()=>{
  assert.equal(d.screenshots.length,5);
  for(const s of d.screenshots){
    assert(s.alt.length>30&&s.instructions.length>80&&s.versionNote.length>60);
    assert(s.width>0&&s.height>0);assert(s.credit.includes('Paradox'));assert(d.sources.some(x=>x.id===s.source));
    assert(!s.src.includes('..'));const file=fs.readFileSync(new URL('.'+s.src,root));
    if(s.src.endsWith('.png'))assert.equal(file.subarray(1,4).toString(),'PNG');else assert.equal(file.readUInt16BE(0),0xffd8);
  }
});
test('Acht Roemeense acties hebben passende beelden, terwijl taakidentifiers behouden blijven',()=>{
  const r=d.routes.find(r=>r.id==='rom-historical-1936');assert.equal(r.tasks.length,18);
  assert.equal(r.tasks.filter(t=>t.screenshots?.length).length,8);
  assert(r.tasks.find(t=>t.id==='rom-start-production').screenshots.includes('rom-production-screen'));
  assert(r.tasks.find(t=>t.id==='rom-1937-diplomacy').screenshots.includes('rom-political-choices'));
  for(const t of r.tasks)for(const id of t.screenshots||[])assert(d.screenshots.some(s=>s.id===id));
  const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');for(const s of d.screenshots)assert(sw.includes(s.src));
});
