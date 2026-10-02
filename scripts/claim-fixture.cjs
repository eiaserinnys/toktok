// Local-only test setup: production never imports this module or test/worker.ts.
const {spawnSync}=require('node:child_process');
function call(base,path,method='GET',data,headers={}){
 if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('fixture only supports localhost');
 const args=['--silent','--fail-with-body','--max-time','8','--dump-header','-','-X',method,base+path];
 if(data!==undefined)args.push('-H','Content-Type: application/json','--data-binary',JSON.stringify(data));
 for(const [key,value]of Object.entries(headers))args.push('-H',key+': '+value);
 const response=spawnSync('curl',args,{encoding:'utf8',timeout:10000});if(response.status!==0)throw Error('local claim fixture request failed');
 const parts=response.stdout.split(/\r?\n\r?\n/),body=parts.pop(),header=parts.join('\n');
 return {data:body?JSON.parse(body):null,cookie:header.split(/\r?\n/).filter(s=>/^set-cookie:/i.test(s)).map(s=>s.slice(s.indexOf(':')+1).trim().split(';')[0]).find(s=>s.startsWith('__Host-toktok_session='))??header.split(/\r?\n/).find(s=>/^set-cookie:/i.test(s))?.slice(11).trim().split(';')[0]};
}
function approvedAgent(base){
 const a=call(base,'/api/agents','POST',{name:'로컬 창작 에이전트'}).data,claim={agent_id:a.agent.id,claim_token:new URL(a.claim_url).pathname.split('/').at(-1)};
 const started=call(base,'/api/auth/start','POST',{claim},{Origin:base}),flow=started.data;
 call(base,'/api/auth/email/send','POST',{flow_id:flow.flow,email:'allowed@fixture.test',client_request_id:require('node:crypto').randomUUID()},{Origin:base,Cookie:started.cookie});
 const otp=call(base,'/__fixture/inbox?email=allowed%40fixture.test').data.delivery.code;
 const complete=call(base,'/api/auth/complete','POST',{flow:flow.flow,nonce:flow.nonce,claim,otp},{Origin:base,Cookie:started.cookie});
 const session=call(base,'/api/session','GET',undefined,{Cookie:complete.cookie}).data;
 call(base,`/api/claims/${a.agent.id}/approve`,'POST',{risk_ack_version:'toktok-risk-v1'}, {Origin:base,Cookie:complete.cookie,'X-CSRF-Token':session.csrf,Authorization:'Bearer '+claim.claim_token});
 return a.agent_token;
}
module.exports={call,approvedAgent};
