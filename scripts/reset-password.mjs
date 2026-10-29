import {openStore} from '../lib/store.mjs';
const store=await openStore();
try{await store.resetPassword(process.env.ACCOUNT_USER,process.env.ACCOUNT_PASSWORD);console.log('Wachtwoord aangepast; bestaande sessies voor dit account zijn ingetrokken.')}catch{console.error('Reset mislukt. Gebruik ACCOUNT_USER (ben, robin of erwin) en ACCOUNT_PASSWORD (minstens 12 tekens).');process.exitCode=1}finally{await store.close()}
