import {test} from 'node:test';import assert from 'node:assert/strict';import {accountPasswordIssues,startupMessage} from '../lib/startup.mjs';
test('Opstartdiagnose noemt ontbrekende of ongeldige variabelen zonder wachtwoorden te tonen',()=>{
  assert.deepEqual(accountPasswordIssues(['ben','robin','erwin'],{BEN_PASSWORD:'geldig-wachtwoord',ROBIN_PASSWORD:'kort'}),['ROBIN_PASSWORD is korter dan 12 tekens','ERWIN_PASSWORD ontbreekt in de container']);
  assert.deepEqual(accountPasswordIssues([],{}),[]);
  const secret='NIET-LOGGEN-DIT-IS-GEHEIM';
  const message=startupMessage({code:'ACCOUNT_CONFIG',issues:accountPasswordIssues(['ben'],{})},'accounts');
  assert(message.includes('BEN_PASSWORD'));assert(message.includes('Compose'));
  for(const stage of ['database','accounts'])for(const code of ['28P01','ECONNREFUSED','3D000','42501','unknown'])assert(!startupMessage({code,message:secret},stage).includes(secret));
  assert(startupMessage({code:'28P01'},'database').includes('bestaand databasewachtwoord'));
});
