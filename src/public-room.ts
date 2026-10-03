import {DurableObject} from 'cloudflare:workers';
import {PublicRoomCore} from './public-core';
import {CloudflareRepository} from './storage/cloudflare';
import {PUBLIC_POLICY,PUBLIC_CATALOG,type PublicEnv,type PublicPolicy,type ValidatedOperatorAck} from './public-contracts';
import {publicError} from './public-http';
import {fail} from './http';
/** History uses bounded SQLite records; hash-only entry authority is durable; active leases remain volatile. Alarms only perform bounded cleanup. */
export class PublicRoom extends DurableObject<PublicEnv> {
 readonly core:PublicRoomCore;private readonly repo:CloudflareRepository;private slug?:string;private restored:Promise<void>;private revision=0;
 constructor(ctx:DurableObjectState,env:PublicEnv,dependencies?:{budgetFactory:(env:PublicEnv)=>import('./private-contracts').PrivateBudgetPort}){
  super(ctx,env);this.repo=new CloudflareRepository(ctx.storage);
  this.core=new PublicRoomCore({origin:env.PUBLIC_ORIGIN,repo:this.repo,budget:dependencies?.budgetFactory(env),catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY}),scheduleCleanup:async at=>{if(at===null)await ctx.storage.deleteAlarm();else await ctx.storage.setAlarm(Math.max(Date.now()+1,at));}});
  this.restored=ctx.blockConcurrencyWhile(async()=>{this.slug=await ctx.storage.get<string>('toktok_public_slug');if(this.slug!==undefined&&!/^[a-z0-9-]{1,64}$/.test(this.slug))fail(503,'ROOM_ID_INVALID','방 식별자가 올바르지 않습니다.');const config=await ctx.storage.get<{revision:number;policy:PublicPolicy;catalog:{slug:string;title:string;generation?:string}[]}>('toktok_public_config');if(config){this.core.configure(config.revision,config.policy,config.catalog);this.revision=config.revision;}});
 }
 private async prepare(slug:string){await this.restored;if(!/^[a-z0-9-]{1,64}$/.test(slug))fail(404,'NOT_FOUND','방이 없습니다.');await this.ctx.blockConcurrencyWhile(async()=>{if(this.slug!==undefined&&this.slug!==slug)fail(403,'ROOM_MISMATCH','방이 다릅니다.');await this.repo.apply();if(this.slug===undefined){await this.ctx.storage.put('toktok_public_slug',slug);this.slug=slug;}});}
 async fetch(request:Request){try{const match=/^\/api\/public\/rooms\/([a-z0-9-]+)(?:\/|$)/.exec(new URL(request.url).pathname);if(!match)fail(404,'NOT_FOUND','경로가 없습니다.');await this.prepare(match[1]);return await this.core.fetch(request);}catch(e){return publicError(e);}}
 async issueOperatorGrant(ack:ValidatedOperatorAck){await this.prepare(ack.room);return this.core.issueOperatorGrant(ack);}
 async connectionApproval(input:import('./public-connections').ConnectionApprovalInput,ip:string,room:string){await this.prepare(room);return this.core.connectionApproval(input,ip,room);}
 async alarm(){await this.restored;if(this.slug)await this.core.maintenance(this.slug);else await this.ctx.storage.deleteAlarm();}
 diagnostics(){return this.core.diagnostics();}
 async configure(revision:number,policy:PublicPolicy,catalog:ReadonlyArray<{slug:string;title:string;generation?:string}>){await this.restored;if(revision<this.revision)return;if(revision===this.revision){if(this.core.hydrateCatalogGenerations(catalog))await this.ctx.storage.put('toktok_public_config',{revision,policy,catalog});return;}this.core.configure(revision,policy,catalog);await this.ctx.storage.put('toktok_public_config',{revision,policy,catalog});this.revision=revision;}
 shutdown(){this.core.shutdown();}
}
