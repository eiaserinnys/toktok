import {RecentBuffer,RECENT_BUFFER_MAX_BYTES} from '../src/recent-buffer';
import {RecordCollection as C,type RepositoryPort} from '../src/storage/repository';
export async function recentBufferContract(repo:RepositoryPort){
 const check=(value:unknown,label:string)=>{if(!value)throw Error(label);};
 const deny=async(fn:()=>Promise<unknown>,code:string)=>{try{await fn();throw Error('EXPECTED_FAILURE');}catch(e){check((e as {code?:string}).code===code,'EXPECTED_'+code);}};
 const bounds={messages:500,retentionMs:3600000,expiresAt:null},now=1800000000000,buffer=new RecentBuffer(repo,'public:contract');await buffer.initialize();
 const input=(id:string,text='fictional')=>({sender:{id:'fixture-sender',nickname:'fictional'},text,client_message_id:id});
 await deny(()=>buffer.append(input('invalid'),{...bounds,messages:501},now),'BUFFER_POLICY_INVALID');
 const concurrent=await Promise.all(Array.from({length:12},(_,i)=>buffer.append(input('parallel-'+i),bounds,now)));
 check(new Set(concurrent.map(v=>v.message.sequence)).size===12,'ATOMIC_SEQUENCE');
 const original=concurrent[0],cold=new RecentBuffer(repo,'public:contract'),replay=await cold.append(input('parallel-0'),bounds,now);
 check(replay.replayed&&replay.message.cursor===original.message.cursor,'RESTART_IDEMPOTENCY');
 await deny(()=>cold.append(input('parallel-0','changed'),bounds,now),'IDEMPOTENCY_CONFLICT');
 for(let i=12;i<502;i++)await buffer.append(input('count-'+i),bounds,now);
 const state=await buffer.metadata();check(state.count===500&&state.sequence===502&&state.first===3,'COUNT_CEILING');
 const rows=await repo.transaction('public:contract',async tx=>({m:(await tx.list(C.recent_messages,{prefix:'m:',limit:1000})).length,d:(await tx.list(C.recent_messages,{prefix:'d:',limit:1000})).length}));check(rows.m===500&&rows.d===500,'DEDUPE_CEILING');
 const shrunk={...bounds,messages:2};check(await cold.lookup(input('count-499'),shrunk,now)===undefined,'SHRUNK_DEDUPE_NOT_VISIBLE');
 const shrunkPage=await cold.read(shrunk,now,undefined,20,{ms:300000,messages:20});check(shrunkPage.messages.length===2&&shrunkPage.messages[0].sequence===501,'SHRUNK_READ_CEILING');
 const page=await cold.read(bounds,now,undefined,20,{ms:300000,messages:20});check(page.messages.length===20&&page.messages[0].sequence===483&&page.cursor===state.epoch+':502','INITIAL_WINDOW');
 const delta=await cold.read(bounds,now,state.epoch+':498',2,{ms:300000,messages:20});check(delta.messages.length===2&&delta.has_more&&delta.cursor===state.epoch+':500','DELTA_PAGE');
 const gap=await cold.read(bounds,now,state.epoch+':0',20,{ms:300000,messages:20});check(gap.history_status==='history_gap','GAP');
 const bytes=new RecentBuffer(repo,'public:byte-bound');await bytes.initialize();for(let i=0;i<140;i++)await bytes.append(input('bytes-'+i,'x'.repeat(16384)),bounds,now);
 const bounded=await bytes.metadata();check(bounded.bytes<=RECENT_BUFFER_MAX_BYTES&&bounded.count<140,'BYTE_CEILING');
 let expired=await cold.cleanup(bounds,now+3600000);check(expired.state.count===400&&expired.next===now+3601000,'CLEANUP_BATCH_100');for(let i=0;i<4;i++)expired=await cold.cleanup(bounds,now+3600000);check(expired.state.count===0&&expired.next===null&&expired.state.epoch===state.epoch&&expired.state.sequence===502,'TIME_CLEANUP_CURSOR');
 const empty=await repo.transaction('public:contract',tx=>tx.list(C.recent_messages,{limit:1000}));check(empty.length===0,'BODY_DEDUPE_EXPIRED');
 await bytes.cleanup({...bounds,expiresAt:now+100},now+100);await bytes.cleanup({...bounds,expiresAt:now+100},now+100);check((await bytes.metadata()).count===0,'TTL_FIRST');
 const recycled=new RecentBuffer(repo,'public:recycled');await recycled.initialize();for(let i=0;i<205;i++)await recycled.append(input('reuse-'+i),bounds,now);
 // A reused expired key can point at the new message while old rows await the next batch.
 const fresh=await recycled.append(input('reuse-204'),bounds,now+3600000);check(fresh.message.sequence===206,'EXPIRED_KEY_REUSE');
 await recycled.cleanup(bounds,now+3600000);await recycled.cleanup(bounds,now+3600000);
 check((await recycled.lookup(input('reuse-204'),bounds,now+3600000))?.cursor===fresh.message.cursor,'OLD_CLEANUP_PRESERVES_NEW_DEDUPE');
 const before=await recycled.metadata();try{await recycled.append(input('rollback'),bounds,now+3600000,async()=>{throw Error('FIXTURE_TX_ROLLBACK');});throw Error('EXPECTED_ROLLBACK');}catch(e){check((e as Error).message==='FIXTURE_TX_ROLLBACK','TX_FAILURE');}
 check(JSON.stringify(await recycled.metadata())===JSON.stringify(before)&&await recycled.lookup(input('rollback'),bounds,now+3600000)===undefined,'ATOMIC_ROLLBACK');
 const same=await Promise.all([recycled.append(input('same'),bounds,now+3600000),recycled.append(input('same'),bounds,now+3600000)]);check(same[0].message.cursor===same[1].message.cursor&&same.filter(r=>r.replayed).length===1,'CONCURRENT_SAME_ID');
 await recycled.cleanup(bounds,now+7200000);
 return {count_ceiling:500,byte_ceiling:RECENT_BUFFER_MAX_BYTES,concurrent:12,initial_window:20,restart_replay:true,expired_rows:0};
}
