import {DurableObject} from 'cloudflare:workers';
import {CloudflareRepository} from './storage/cloudflare';
import {PrivateRoomCore} from './private-core';
import type {PrivateRoomInit,PrivateEnv,PrivateRoomDependencies} from './private-contracts';
/** Root injects CONTROL -> HTTP budget adapter factory. No function-valued Wrangler binding. */
export class PrivateRoom extends DurableObject<PrivateEnv> {
 readonly core:PrivateRoomCore;private readonly repo:CloudflareRepository;
 constructor(ctx:DurableObjectState,env:PrivateEnv,dependencies?:PrivateRoomDependencies){super(ctx,env);this.repo=new CloudflareRepository(ctx.storage);this.core=new PrivateRoomCore({origin:env.PUBLIC_ORIGIN,repo:this.repo,budget:dependencies?.budgetFactory(env)});}
 async initialize(input:PrivateRoomInit){await this.repo.apply();const result=await this.core.initialize(input);await this.schedule();return result;}
 async fetch(request:Request){const response=await this.core.fetch(request);try{await this.core.inspect();}catch{return response;}await this.schedule();return response;}
 inspect(){return this.core.inspect();}
 async alarm(){await this.core.maintenance();await this.schedule();}
 private async schedule(){const result=await this.core.maintenance() as {next_maintenance_at:number|null};if(result.next_maintenance_at!==null)await this.ctx.storage.setAlarm(result.next_maintenance_at);else await this.ctx.storage.deleteAlarm();}
 shutdown(){this.core.shutdown();}
 diagnostics(){return this.core.diagnostics();}
}
