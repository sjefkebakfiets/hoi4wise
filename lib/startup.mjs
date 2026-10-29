export function accountPasswordIssues(usernames,env){
  return usernames.flatMap(username=>{
    const key=username.toUpperCase()+'_PASSWORD',value=env[key];
    if(typeof value!=='string'||value.length===0)return [key+' ontbreekt in de container'];
    if(value.length<12)return [key+' is korter dan 12 tekens'];
    if(value.length>1024)return [key+' is langer dan 1024 tekens'];
    return [];
  });
}
export function startupMessage(error,stage){
  if(error?.code==='ACCOUNT_CONFIG')return 'Accountinitialisatie mislukt: '+error.issues.join('; ')+'. Voeg de variabelen toe aan environment in Compose en maak de appcontainer opnieuw aan.';
  const messages={
    '28P01':'PostgreSQL weigert de database-inloggegevens. Controleer POSTGRES_PASSWORD; wijzigen in .env wijzigt geen bestaand databasewachtwoord.',
    '3D000':'De ingestelde PostgreSQL-database bestaat niet.',
    '42501':'De databasegebruiker heeft onvoldoende rechten voor het schema of de migraties.',
    'ECONNREFUSED':'PostgreSQL is niet bereikbaar op de ingestelde host/poort.',
    'ENOTFOUND':'De ingestelde PostgreSQL-hostnaam kan niet worden gevonden.',
    'EAI_AGAIN':'De PostgreSQL-hostnaam kan tijdelijk niet worden gevonden.',
  };
  return messages[error?.code]||('Opstart mislukt tijdens '+(stage==='accounts'?'accountinitialisatie':'databaseverbinding of schemamigratie')+'. Controleer de databaseconfiguratie en PostgreSQL-logs.');
}
