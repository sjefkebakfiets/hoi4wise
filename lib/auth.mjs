import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const USERS=['ben','robin','erwin'];
export async function hashPassword(password){
  if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('Wachtwoord moet 12 tot 1024 tekens bevatten.');
  const salt=randomBytes(16).toString('hex');
  const key=await scrypt(password,salt,64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password,hash){
  if(typeof password!=='string'||password.length>1024||typeof hash!=='string')return false;
  const [algorithm,salt,key]=hash.split(':');
  if(algorithm!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(key))return false;
  const actual=await scrypt(password,salt,64);
  return timingSafeEqual(actual,Buffer.from(key,'hex'));
}
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export const newToken=()=>randomBytes(32).toString('base64url');
