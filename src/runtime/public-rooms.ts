import {PublicEntries} from '../public-entries';
import {RecentBuffer} from '../recent-buffer';
import type {RepositoryPort} from '../storage/repository';
import {PublicRoomCore} from '../public-core';
import type {PrivateBudgetPort} from '../private-contracts';
import {handlePublicRequestWith,publicLimited} from '../public-http';
import {INTERNAL_IP_HEADER,type PublicPolicy} from '../public-contracts';
import {validatePublicPolicy,validatePublicCatalog} from '../public-policy';
export class PublicRooms {
  private rooms=new Map<string,PublicRoomCore>();private revision=0;private timers=new Map<string,ReturnType<typeof setTimeout>>();private stopped=false;
  private catalog:ReadonlyArray<{slug:string;title:string;generation?:string}>;private policy:PublicPolicy;
  constructor(private readonly origin:string,catalog:ReadonlyArray<{slug:string;title:string;generation?:string}>,policy:PublicPolicy,private readonly budget?:PrivateBudgetPort,private readonly repo?:RepositoryPort){this.catalog=validatePublicCatalog(catalog);this.policy=validatePublicPolicy(policy);}
  private pruneRemoved():void {
    for(const [slug,room] of this.rooms){
      if(this.catalog.some(r=>r.slug===slug))continue;
      const d=room.diagnostics();
      if(d.leases.participants===0&&d.leases.watchers===0&&d.pending_grants===0&&d.active_handlers===0&&d.active_waits===0){room.shutdown();this.rooms.delete(slug);}
    }
  }
  has(slug:string):boolean {this.pruneRemoved();return this.rooms.has(slug);}
  room(slug:string):PublicRoomCore {
    this.pruneRemoved();let room=this.rooms.get(slug);if(!room){if(!this.catalog.some(r=>r.slug===slug))throw new Error('UNKNOWN_ROOM');if(this.rooms.size>=100)publicLimited();room=new PublicRoomCore({origin:this.origin,budget:this.budget,repo:this.repo,scheduleCleanup:async at=>this.schedule(slug,at),catalog:()=>this.catalog,policy:()=>this.policy});this.rooms.set(slug,room);}return room;
  }
  configure(revision:number,policy:PublicPolicy,catalog:ReadonlyArray<{slug:string;title:string;generation?:string}>):void {
    if(!Number.isSafeInteger(revision)||revision<=this.revision)throw new Error('SETTINGS_REVISION');const p=validatePublicPolicy(policy),c=validatePublicCatalog(catalog);
    for(const room of this.rooms.values())room.configure(revision,p,c);this.policy=p;this.catalog=c;this.revision=revision;this.pruneRemoved();
  }
  fetch(request:Request):Promise<Response|null> {
    return handlePublicRequestWith(request,{origin:this.origin,catalog:()=>this.catalog,policy:()=>this.policy,room:slug=>this.room(slug),existingRoom:slug=>this.has(slug),trustedIpHash:async r=>r.headers.get(INTERNAL_IP_HEADER)??''});
  }
  private schedule(slug:string,at:number|null){clearTimeout(this.timers.get(slug));this.timers.delete(slug);if(this.stopped||at===null)return;const timer=setTimeout(()=>{void this.restoreRoom(slug).catch(()=>this.schedule(slug,Date.now()+60000));},Math.min(2147483647,Math.max(1,at-Date.now())));timer.unref();this.timers.set(slug,timer);}
  async restoreRoom(slug:string){if(!this.repo)throw new Error('BUFFER_UNCONFIGURED');const result=await new RecentBuffer(this.repo,'public:'+slug).cleanup({messages:this.policy.messages,retentionMs:this.policy.retentionMs,expiresAt:null},Date.now());const entries=await new PublicEntries(this.repo,slug,()=>this.catalog.find(r=>r.slug===slug)?.generation,this.origin,Date.now,()=>false,()=>{}).cleanup();const times=[result.next,entries.next].filter((v):v is number=>v!==null);this.schedule(slug,times.length?Math.min(...times):null);}
  shutdown(){this.stopped=true;for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();for(const room of this.rooms.values())room.shutdown();}
}
