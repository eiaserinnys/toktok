import {PrivateRoomCore} from '../private-core';
import type {PrivateCoreOptions,PrivateRoomInit} from '../private-contracts';
export class PrivateRooms {
 private rooms=new Map<string,PrivateRoomCore>();private timers=new Map<string,ReturnType<typeof setTimeout>>();private stopped=false;
 constructor(private readonly options:PrivateCoreOptions){}
 room(id:string){let core=this.rooms.get(id);if(!core){if(this.stopped)throw new Error('ROOM_SHUTDOWN');core=new PrivateRoomCore(this.options);this.rooms.set(id,core);}return core;}
 async initialize(snapshot:PrivateRoomInit){const result=await this.room(snapshot.id).initialize(snapshot);await this.schedule(snapshot.id);return result;}
 async fetch(request:Request):Promise<Response|null>{const match=/^\/(?:api\/v1\/rooms|r)\/([a-zA-Z0-9_-]+)(?:\/|$)/.exec(new URL(request.url).pathname);if(!match)return null;const response=await this.room(match[1]).fetch(request);await this.schedule(match[1]);return response;}
 private async schedule(id:string){if(this.stopped)return;clearTimeout(this.timers.get(id));const core=this.rooms.get(id)!;try{const state=await core.maintenance() as {next_maintenance_at:number|null};if(state.next_maintenance_at!==null){const timer=setTimeout(()=>{this.timers.delete(id);void this.schedule(id).catch(()=>{});},Math.max(1,state.next_maintenance_at-(this.options.clock?.()??Date.now())));timer.unref();this.timers.set(id,timer);}else{core.shutdown();this.rooms.delete(id);this.timers.delete(id);}}catch{core.shutdown();this.rooms.delete(id);this.timers.delete(id);}}
 shutdown(){this.stopped=true;for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();for(const core of this.rooms.values())core.shutdown();}
 diagnostics(){return {rooms:this.rooms.size,timers:this.timers.size};}
}
