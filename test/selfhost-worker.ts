import {DurableObject} from 'cloudflare:workers';
import {CloudflareRepository,type CloudflareRecordStorage,type CloudflareSqlValue} from '../src/storage/cloudflare';
import {PrivateRoom as BasePrivateRoom} from '../src/private-room';
import type {PrivateEnv} from '../src/private-contracts';
import {HttpError} from '../src/http';
import {RecordCollection as C,RepositoryError} from '../src/storage/repository';
import {handlePublicRequest} from '../src/public-http';
import type {PublicEnv} from '../src/public-contracts';
import {PublicRoom as BasePublicRoom} from '../src/public-room';
import {TEST_BUDGET} from './selfhost-budget';
function bodyObservation(request:Request,response:Response){const headers=new Headers(response.headers);headers.set('x-fixture-body-used',String(request.bodyUsed));headers.set('x-fixture-body-locked',String(request.body?.locked??false));return new Response(response.body,{status:response.status,headers});}
export class PublicRoom extends BasePublicRoom {constructor(ctx:DurableObjectState,env:PublicEnv){super(ctx,env,{budgetFactory:()=>TEST_BUDGET});}async fetch(request:Request){return bodyObservation(request,await super.fetch(request));}}
export class PrivateRoom extends BasePrivateRoom {constructor(ctx:DurableObjectState,env:PrivateEnv){super(ctx,env,{budgetFactory:()=>TEST_BUDGET});}async fetch(request:Request){return bodyObservation(request,await super.fetch(request));}}
interface RecordFixtureEnv {PUBLIC_ORIGIN:string;}
export class RecordFixture extends DurableObject<RecordFixtureEnv> {
  readonly repo:CloudflareRepository;
  constructor(ctx:DurableObjectState,env:RecordFixtureEnv){super(ctx,env);this.repo=new CloudflareRepository(ctx.storage);}
  async meterProbe(){
    await this.repo.apply();let read=0,written=0;
    const storage=this.ctx.storage;
    const metered:CloudflareRecordStorage={sql:{exec<T extends Record<string,CloudflareSqlValue>>(query:string,...bindings:(string|number|null)[]){const cursor=storage.sql.exec<T>(query,...bindings),rows=cursor.toArray();read+=cursor.rowsRead;written+=cursor.rowsWritten;return {toArray:()=>rows};}},transaction:fn=>storage.transaction(fn)};
    const repo=new CloudflareRepository(metered);
    await repo.transaction('control',async tx=>{const old=await tx.get(C.budgets,'mock-reserve');await tx.put(C.budgets,'mock-reserve',{used:((old?.used as number|undefined)??0)+1});await tx.put(C.budgets,'mock-dedupe',{amount:1});});const reserve={rowsRead:read,rowsWritten:written};read=0;written=0;
    await repo.transaction('control',async tx=>{await tx.get(C.budgets,'mock-dedupe');await tx.delete(C.budgets,'mock-dedupe');});return {reserve,cleanup:{rowsRead:read,rowsWritten:written}};
  }
  async domainProbe(){
    await this.repo.apply();const statuses:number[]=[];let rolledBack=true;
    for(const status of [403,409,429]){try{await this.repo.transaction('control',async tx=>{await tx.put(C.budgets,'domain',{used:status});throw new HttpError(status,'DOMAIN_'+status,'mock domain');});}catch(error){if(!(error instanceof HttpError)||error.code!=='DOMAIN_'+status)throw new Error('DOMAIN_NOT_PRESERVED');statuses.push(error.status);}rolledBack=rolledBack&&await this.repo.transaction('control',async tx=>await tx.get(C.budgets,'domain'))===undefined;}
    let bounded=false;try{await this.repo.transaction('control',async tx=>{for(let i=0;i<4097;i++)await tx.get(C.budgets,'missing');});}catch(error){bounded=error instanceof RepositoryError&&error.code==='TRANSACTION_LIMIT';}
    return {statuses,rolledBack,bounded};
  }
  async probe():Promise<{rolledBack:boolean;before:number;winners:number;forbidden:boolean;nested:boolean}>{
    await this.repo.apply();await this.repo.transaction('control',async tx=>{await tx.put(C.budgets,'quota',{used:0});await tx.put(C.invitations,'one',{remaining:1});});
    let rolledBack=false;try{await this.repo.transaction('control',async tx=>{await tx.put(C.budgets,'quota',{used:99});throw new RepositoryError('ROLLBACK_PROBE');});}catch(error){rolledBack=error instanceof RepositoryError;}
    const before=await this.repo.transaction<number>('control',async tx=>Number((await tx.get(C.budgets,'quota'))!.used));
    const race=await Promise.all(Array.from({length:2},()=>this.repo.transaction('control',async tx=>{if((await tx.get(C.invitations,'one'))!.remaining!==1)return false;await tx.put(C.invitations,'one',{remaining:0});return true;})));
    let forbidden=false,nested=false;try{await this.repo.transaction('room:mock',async tx=>{await tx.put(C.private_messages,'denied',{text:'mock'});});}catch(error){forbidden=error instanceof RepositoryError&&error.code==='PERSIST_DENIED';}
    try{await this.repo.transaction('control',async()=>this.repo.transaction('control',async()=>1));}catch(error){nested=error instanceof RepositoryError&&error.code==='NESTED_TRANSACTION';}
    return {rolledBack,before,winners:race.filter(Boolean).length,forbidden,nested};
  }
}
export default {fetch:(request:Request,env:PublicEnv)=>handlePublicRequest(request,env).then(r=>r??new Response(null,{status:404}))};
