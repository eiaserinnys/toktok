import {DurableObject} from 'cloudflare:workers';
import {fail} from './http';
import {publicError} from './public-http';
import {CloudflareRepository} from './storage/cloudflare';
import {PrivateRoomCore} from './private-core';
import type {PrivateRoomInit,PrivateEnv,PrivateRoomDependencies} from './private-contracts';
/** Root injects CONTROL -> HTTP budget adapter factory. No function-valued Wrangler binding. */
export class PrivateRoom extends DurableObject<PrivateEnv> {
 readonly core:PrivateRoomCore;private readonly repo:CloudflareRepository;private roomId?:string;private readonly restored:Promise<void>;
 constructor(ctx:DurableObjectState,env:PrivateEnv,dependencies?:PrivateRoomDependencies){super(ctx,env);this.repo=new CloudflareRepository(ctx.storage);this.core=new PrivateRoomCore({origin:env.PUBLIC_ORIGIN,repo:this.repo,budget:dependencies?.budgetFactory(env)});this.restored=ctx.blockConcurrencyWhile(async()=>{const id=await ctx.storage.get<string>('toktok_private_room_id');if(id!==undefined&&!/^[a-zA-Z0-9_-]{1,128}$/.test(id))fail(503,'ROOM_ID_INVALID','방 식별자 metadata가 올바르지 않습니다.');this.roomId=id;});}
 async initialize(input:PrivateRoomInit){await this.restored;if(!/^[a-zA-Z0-9_-]{1,128}$/.test(input.id))fail(400,'ROOM_ID_INVALID','방 식별자가 올바르지 않습니다.');await this.ctx.blockConcurrencyWhile(async()=>{await this.repo.apply();if(this.roomId!==undefined&&this.roomId!==input.id)fail(409,'ROOM_MISMATCH','이미 다른 방으로 초기화되었습니다.');if(this.roomId===undefined){await this.ctx.storage.put('toktok_private_room_id',input.id);this.roomId=input.id;}});const result=await this.core.initialize(input);await this.schedule();return result;}
 async fetch(request:Request){try{await this.restored;if(request.method==='GET'&&this.repo.check()==='blank')fail(404,'ROOM_NOT_FOUND','방이 없습니다.');}catch(error){return publicError(error);}const response=await this.core.fetch(request);try{await this.core.inspect();}catch{return response;}await this.schedule();return response;}
 async inspect(id?:string){await this.restored;if(id!==undefined&&this.roomId!==undefined&&id!==this.roomId)fail(409,'ROOM_MISMATCH','방이 다릅니다.');return this.core.inspect(id??this.roomId);}
 async alarm(){await this.restored;if(!this.roomId)fail(503,'ROOM_ID_REQUIRED','방 식별자 metadata가 없습니다.');await this.core.maintenance(this.roomId);await this.schedule();}
 private async schedule(){await this.restored;if(!this.roomId)fail(503,'ROOM_ID_REQUIRED','방 식별자 metadata가 없습니다.');const result=await this.core.maintenance(this.roomId) as {next_maintenance_at:number|null};if(result.next_maintenance_at!==null)await this.ctx.storage.setAlarm(result.next_maintenance_at);else await this.ctx.storage.deleteAlarm();}
 shutdown(){this.core.shutdown();}
 diagnostics(){return this.core.diagnostics();}
}
