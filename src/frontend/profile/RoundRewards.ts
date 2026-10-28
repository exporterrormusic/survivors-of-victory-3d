import { readProfileSection, writeProfileSection } from '../persistence/ProfileStorage';

/** Keep the existing core wallet and unlocks. Round talents never enter the profile. */
export function awardRoundCore(roundId:string):boolean {
  if(!roundId)return false;
  const value=readProfileSection<unknown>('roster',{});
  const roster=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const receipts=Array.isArray(roster.roundCoreReceipts)?roster.roundCoreReceipts.filter((x):x is string=>typeof x==='string'):[];
  if(receipts.includes(roundId))return true;
  const balance=Number.isSafeInteger(roster.pristineCores)&&Number(roster.pristineCores)>=0?Number(roster.pristineCores):0;
  if(balance>=Number.MAX_SAFE_INTEGER)return false;
  // One storage write commits both reward and receipt, so retry cannot double-pay.
  return writeProfileSection('roster',{...roster,pristineCores:balance+1,roundCoreReceipts:[...receipts.slice(-99),roundId]});
}
