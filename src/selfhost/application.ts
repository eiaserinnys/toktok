import {RepositoryError} from '../storage/repository';
import type {NodeRepositoryPort} from '../storage/node-maintenance';
import type {PrivateBudgetPort} from '../private-contracts';
import type {IdentityOptions} from '../email';
import type {Settings} from '../settings-schema';
import {PublicRooms} from '../runtime/public-rooms';
import {PrivateRooms} from '../runtime/private-rooms';
import {createServer} from '../runtime/node-http';
import {ControlCore} from '../control-core';
import {createHttpApplication} from '../application';
import {controlBudget} from '../host-budget';
import {demoInstallationProfile} from '../installation-profile';
import {publicPolicy,publicCatalog} from '../runtime-config';
import {PUBLIC_POLICY} from '../public-contracts';
import {socketAddress} from '../request-context';
import {fileAssets} from './static';
import type {RegistryInput,ControlHttpPort,IdentityEnv} from '../identity-types';
import type {RuntimeConfig} from '../control-contracts';

export interface ApplicationOptions {origin:string;repo:NodeRepositoryPort;budget?:PrivateBudgetPort;hostClose?:()=>void|Promise<void>;router?:(request:Request)=>Promise<Response|null>;assets?:string;trustedProxyCidrs?:readonly string[];bootstrapEmail?:string;profile?:Settings;email?:Pick<IdentityEnv,'EMAIL'|'EMAIL_FROM'>;auth?:Pick<IdentityOptions,'sendEmail'|'now'>;}
/** Single-process room affinity, one selected repository, same HTTP/domain as Cloudflare. */
export function createApplication(options:ApplicationOptions){
 let startupComplete=false,stopping=false,maintenanceTimer:ReturnType<typeof setTimeout>|undefined,scheduleRevision=0;
 const core=new ControlCore(options.repo,{bootstrapEmail:options.bootstrapEmail,installation:{profile:options.profile??demoInstallationProfile(),enforcement_version:1},enforcement:{version:1,ready:()=>!stopping&&options.repo.ready()}});
 async function schedule(){const revision=++scheduleRevision;clearTimeout(maintenanceTimer);if(stopping)return;const next=await core.maintain();if(!stopping&&revision===scheduleRevision&&next!==undefined){maintenanceTimer=setTimeout(()=>{void schedule().catch(()=>{});},Math.min(2147483647,Math.max(1,next-Date.now())));maintenanceTimer.unref();}}
 const control:ControlHttpPort={async execute(action:string,input:RegistryInput){const result=await core.execute(action,input);await schedule();return result;}};
 const budget=options.budget??controlBudget(control,options.auth?.now);
 const rooms=new PublicRooms(options.origin,[],{...PUBLIC_POLICY},budget,options.repo);
 const privateRooms=new PrivateRooms({origin:options.origin,repo:options.repo,budget,clock:options.auth?.now});
 let applied=0;
 const configure=(config:RuntimeConfig)=>{if(config.revision>applied){rooms.configure(config.revision,publicPolicy(config),publicCatalog(config));applied=config.revision;}};
 const buckets=new Map<string,{count:number;until:number}>();
 const edgeLimit={async limit({key}:{key:string}){const now=Date.now();let entry=buckets.get(key);if(!entry||entry.until<=now){if(buckets.size>=4096){for(const[k,v]of buckets)if(v.until<=now)buckets.delete(k);if(buckets.size>=4096)return {success:false};}entry={count:0,until:now+60000};buckets.set(key,entry);}entry.count++;return {success:entry.count<=120};}};
 const app=createHttpApplication({origin:options.origin,assets:options.assets?fileAssets(options.assets):{fetch:async()=>new Response(null,{status:404})},control,edgeLimit,trustedIP:socketAddress,auth:options.auth,identity:options.email,
  publicRoom:async(slug,config)=>{configure(config);return rooms.room(slug);},
  publicRoomExists:async(slug,config)=>{configure(config);return rooms.has(slug);},
  privateRoom:id=>({initialize:s=>privateRooms.initialize(s),fetch:async r=>(await privateRooms.fetch(r))!,inspect:()=>privateRooms.room(id).inspect(id)}),
  ready:()=>startupComplete&&!stopping&&options.repo.ready()});
 const runtime=createServer({origin:options.origin,repo:options.repo,trustedProxyCidrs:options.trustedProxyCidrs,
  readiness:async()=>{if(!startupComplete)return false;const result=await app.fetch(new Request(options.origin+'/ready'));await result.body?.cancel();return result.ok;},
  close:async()=>{stopping=true;clearTimeout(maintenanceTimer);rooms.shutdown();privateRooms.shutdown();await options.hostClose?.();},
  handler:async request=>{await preparation;return await options.router?.(request)??app.fetch(request);}});
 const preparation=(async()=>{
  let after:string|undefined;
  for(;;){
   if(stopping)throw new RepositoryError('STARTUP_INTERRUPTED');
   const page=await options.repo.listPrivateRoomIds({limit:100,...(after?{after}:{})});
   for(const id of page.ids){if(stopping)throw new RepositoryError('STARTUP_INTERRUPTED');await privateRooms.restoreRoom(id);}
   if(page.next===undefined)break;
   if(page.next===after||page.ids.at(-1)!==page.next)throw new RepositoryError('INVALID_MAINTENANCE_PAGE');
   after=page.next;
  }
  const config=await core.execute('get-runtime-config',{}) as RuntimeConfig;configure(config);
  after=undefined;
  for(;;){const page=await options.repo.listPublicRoomIds({limit:100,...(after?{after}:{})});for(const slug of page.ids)await rooms.restoreRoom(slug);if(page.next===undefined)break;if(page.next===after||page.ids.at(-1)!==page.next)throw new RepositoryError('INVALID_MAINTENANCE_PAGE');after=page.next;}
  startupComplete=true;
 })();
 // Retain rejection for prepare()/handler while preventing an unobserved startup promise.
 void preparation.catch(()=>{});
 return {...runtime,rooms,privateRooms,control,core,app,prepare:()=>preparation};
}
