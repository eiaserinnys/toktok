import {SELF,runInDurableObject} from 'cloudflare:test';
import {env} from 'cloudflare:workers';
import {hash,newToken} from '../src/http';
const origin='http://localhost:8787';let ip=0;
export async function approvedAgent(){
 const call=(path:string,data:unknown,headers:Record<string,string>={})=>SELF.fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':`198.51.100.${++ip}`,...headers},body:JSON.stringify(data)});
 const registered=await call('/api/agents',{name:'로컬 창작 에이전트'});if(registered.status!==201)throw Error('fixture register rejected');
 const agent=await registered.json() as {agent:{id:string};agent_token:string;claim_url:string};
 const claim={agent_id:agent.agent.id,claim_token:new URL(agent.claim_url).pathname.split('/').at(-1)};
 // Room regression fixtures seed verified identity only in the real local DO.
 // OTP and browser binding are independently covered by claims/otp runtime tests.
 const token=newToken(),csrf=newToken(),sessionHash=await hash(token);
 const stub:DurableObjectStub=env.IDENTITIES.get(env.IDENTITIES.idFromName('team'));
 await runInDurableObject(stub,(_i,state)=>{
  state.storage.sql.exec('INSERT INTO humans VALUES(?,?,?,?,1) ON CONFLICT(id) DO NOTHING','fixture-owner','email-otp','allowed@fixture.test','allowed@fixture.test');
  state.storage.sql.exec('INSERT INTO sessions VALUES(?,?,?,?)',sessionHash,'fixture-owner',csrf,Date.now()+43200000);
 });
 const cookie='__Host-toktok_session='+token;
 const approved=await call(`/api/claims/${agent.agent.id}/approve`,{risk_ack_version:'toktok-risk-v2'},{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,Authorization:'Bearer '+claim.claim_token});if(approved.status!==200)throw Error('fixture approval rejected');
 return agent.agent_token;
}
