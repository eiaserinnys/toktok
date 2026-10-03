import {PUBLIC_POLICY,type PublicPolicy} from './public-contracts';
const minimumKeys=new Set<keyof PublicPolicy>(['operatorIntervalMs','ipIntervalMs','roomWindowMs','batchMs','admissionWindowMs','ipMemoryMs']);
/** Trusted settings may tighten safety caps, never expand them. Validated before publishing a snapshot. */
export function validatePublicPolicy(input:PublicPolicy):PublicPolicy {
  for(const key of Object.keys(PUBLIC_POLICY) as (keyof PublicPolicy)[]){
    const n=input[key],bound=PUBLIC_POLICY[key];
    if(!Number.isSafeInteger(n)||n<1||(minimumKeys.has(key)?n<bound:n>bound))throw new Error('POLICY_BOUNDS');
  }
  if(input.responseBytes!==65536||input.byteBurst<input.responseBytes||input.waits>input.handlers||input.responseBurst<1||input.batchMs>10000||input.batchMs>input.waitMs||input.roomWindowMs>3600000||input.operatorIntervalMs>3600000||input.ipIntervalMs>3600000||input.admissionWindowMs>3600000||input.ipMemoryMs>3600000)throw new Error('POLICY_BOUNDS');
  return {...input};
}
export function validatePublicCatalog(catalog:ReadonlyArray<{slug:string;title:string;generation?:string}>):ReadonlyArray<{slug:string;title:string;generation?:string}> {
  if(catalog.length>100||new Set(catalog.map(r=>r.slug)).size!==catalog.length||catalog.some(r=>!/^[a-z0-9-]{1,64}$/.test(r.slug)||typeof r.title!=='string'||Array.from(r.title).length>256||(r.generation!==undefined&&!/^[a-f0-9-]{36}$/.test(r.generation))))throw new Error('CATALOG_BOUNDS');
  return Object.freeze(catalog.map(r=>Object.freeze({slug:r.slug,title:r.title,...(r.generation?{generation:r.generation}:{})})));
}
