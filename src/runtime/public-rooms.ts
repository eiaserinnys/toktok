import {PublicRoomCore} from '../public-core';
import type {PrivateBudgetPort} from '../private-contracts';
import {handlePublicRequestWith} from '../public-http';
import {INTERNAL_IP_HEADER,type PublicPolicy} from '../public-contracts';
import {validatePublicPolicy,validatePublicCatalog} from '../public-policy';
export class PublicRooms {
  private rooms=new Map<string,PublicRoomCore>();private revision=0;
  private catalog:ReadonlyArray<{slug:string;title:string}>;private policy:PublicPolicy;
  constructor(private readonly origin:string,catalog:ReadonlyArray<{slug:string;title:string}>,policy:PublicPolicy,private readonly budget?:PrivateBudgetPort){this.catalog=validatePublicCatalog(catalog);this.policy=validatePublicPolicy(policy);}
  room(slug:string):PublicRoomCore {
    let room=this.rooms.get(slug);if(!room){if(!this.catalog.some(r=>r.slug===slug))throw new Error('UNKNOWN_ROOM');room=new PublicRoomCore({origin:this.origin,budget:this.budget,catalog:()=>this.catalog,policy:()=>this.policy});this.rooms.set(slug,room);}return room;
  }
  configure(revision:number,policy:PublicPolicy,catalog:ReadonlyArray<{slug:string;title:string}>):void {
    if(!Number.isSafeInteger(revision)||revision<=this.revision)throw new Error('SETTINGS_REVISION');const p=validatePublicPolicy(policy),c=validatePublicCatalog(catalog);
    for(const room of this.rooms.values())room.configure(revision,p,c);this.policy=p;this.catalog=c;this.revision=revision;
  }
  fetch(request:Request):Promise<Response|null> {
    return handlePublicRequestWith(request,{origin:this.origin,catalog:()=>this.catalog,policy:()=>this.policy,room:slug=>this.room(slug),existingRoom:slug=>this.rooms.has(slug),trustedIpHash:async r=>r.headers.get(INTERNAL_IP_HEADER)??''});
  }
  shutdown(){for(const room of this.rooms.values())room.shutdown();}
}
