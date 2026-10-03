import type {RepositoryPort} from '../storage/repository';
import type {PrivateBudgetPort} from '../private-contracts';
import {PublicRooms} from '../runtime/public-rooms';
import {createServer} from '../runtime/node-http';
import {PUBLIC_CATALOG,PUBLIC_POLICY} from '../public-contracts';
import {staticAsset} from './static';
export interface ApplicationOptions {origin:string;repo:RepositoryPort;budget?:PrivateBudgetPort;hostClose?:()=>void|Promise<void>;router?:(request:Request)=>Promise<Response|null>;assets?:string;trustedProxyCidrs?:readonly string[];}
/** Public foundation only. Root injects the common authenticated control/private router later. */
export function createApplication(options:ApplicationOptions){
  const rooms=new PublicRooms(options.origin,PUBLIC_CATALOG,{...PUBLIC_POLICY},options.budget);
  const runtime=createServer({origin:options.origin,repo:options.repo,trustedProxyCidrs:options.trustedProxyCidrs,close:async()=>{rooms.shutdown();await options.hostClose?.();},handler:async request=>
    await rooms.fetch(request)??await options.router?.(request)??(options.assets?await staticAsset(request,options.assets):null)??new Response(null,{status:404})});
  return {...runtime,rooms};
}
