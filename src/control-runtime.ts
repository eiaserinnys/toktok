import {DurableObject} from 'cloudflare:workers';
import {CloudflareRepository} from './storage/cloudflare';
import {ControlCore,type ControlOptions} from './control-core';
import {json} from './http';
import {controlErrorResponse} from './control-errors';
import type {IdentityEnv,RegistryInput} from './identity-types';
/** The root supplies a trusted code installation profile/enforcement port, never client flags. */
export function createControlPlane(options:(env:IdentityEnv)=>ControlOptions=(env)=>({bootstrapEmail:env.ADMIN_BOOTSTRAP_EMAIL})){
 return class extends DurableObject<IdentityEnv>{
  private repository:CloudflareRepository;
  private core:ControlCore;
  constructor(ctx:DurableObjectState,env:IdentityEnv){super(ctx,env);this.repository=new CloudflareRepository(ctx.storage);this.core=new ControlCore(this.repository,options(env));ctx.blockConcurrencyWhile(async()=>{await this.repository.apply();});}
  async fetch(request:Request){try{const result=await this.core.execute(new URL(request.url).pathname.slice(1),await request.json() as RegistryInput);await this.schedule();return json(result);}catch(e){return controlErrorResponse(e);}}
  private async schedule(){const next=await this.core.maintain();if(next===undefined)await this.ctx.storage.deleteAlarm();else await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,next));}
  async alarm(){await this.core.maintain();await this.schedule();}
 };
}
/** Bind a NEW namespace. Legacy SQL IdentityRegistry data is not migrated. */
export class ControlPlane extends createControlPlane(){}
