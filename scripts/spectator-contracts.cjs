const {approvedAgent}=require('./claim-fixture.cjs');
// Narrow follow-up: controlled expiry metadata 429 and real local owner close.
const fs=require('node:fs'),net=require('node:net'),crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {chromium}=require(process.env.TOKTOK_PLAYWRIGHT_MODULE);
const root=require('node:path').resolve(__dirname,'..'),out=process.env.TOKTOK_BROWSER_OUT;
if(!out)throw Error('TOKTOK_BROWSER_OUT is required');
const evidence={scope:'expiry probe Retry-After (controlled HTTP/time) and closed invite only',cases:[]};
const save=()=>fs.writeFileSync(out+'evidence.json',JSON.stringify(evidence,null,2)),delay=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(v,s)=>{if(!v)throw Error(s);};let token;
function curl(base,path,cap,method='GET',body){
 const args=['--silent','--fail-with-body','--max-time','5','-X',method,base+path];
 if(cap)args.push('-H','Authorization: Bearer '+cap);
 if(body)args.push('-H','Content-Type: application/json','--data-binary',JSON.stringify(body));
 const r=spawnSync('curl',args,{encoding:'utf8',timeout:6000});if(r.status!==0)throw Error('local curl setup failure');return r.stdout?JSON.parse(r.stdout):null;
}
async function main(){
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const base='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config','test/wrangler.jsonc','--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--var','PUBLIC_ORIGIN:'+base],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 server.stdout.resume();server.stderr.resume();let exited=false,browser;const stopped=new Promise(r=>server.once('exit',()=>{exited=true;r();}));
 try{
  let ready=false;for(let i=0;i<100&&!exited;i++){try{curl(base,'/health');ready=true;break;}catch{}await delay(100);}assert(ready,'Worker ready');token=approvedAgent(base);
  browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});evidence.browser=browser.version();
  for(const paused of [false,true]){
   const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();page.setDefaultTimeout(10000);
   const room=curl(base,'/api/rooms',token,'POST',{purpose:'창작 만료 확인',ttl_seconds:300}),path=`/api/rooms/${room.room.id}`;
   const c={case:'expiry metadata 429',paused,requests:[],controlledRetryAfterSeconds:1};evidence.cases.push(c);let metadataCalls=0;
   page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/')){c.requests.push({path:new URL(r.url()).pathname.slice(path.length)||'metadata',at:Date.now()});save();}});
   await page.route(base+path,async route=>{
    metadataCalls++;
    if(metadataCalls===2){c.rateAt=Date.now();save();await route.fulfill({status:429,contentType:'application/json',headers:{'Retry-After':'1'},body:JSON.stringify({error:{code:'RATE_LIMITED'}})});return;}
    const response=await route.fetch(),data=await response.json();
    if(metadataCalls===1)data.room.expires_at=new Date(Date.now()+1200).toISOString();
    else c.recheckAt=Date.now();
    save();await route.fulfill({response,json:data});
   });
   try{
    await page.goto(room.read_url);await page.waitForFunction(()=>document.querySelector('#watch-status')?.textContent.includes('새 대화'));
    if(paused)await page.locator('[data-action=pause]').click();
    while(!c.rateAt)await delay(25);
    await delay(700);c.beforeRetryRequests=c.requests.filter(r=>r.at>c.rateAt&&r.at<c.rateAt+900);save();assert(c.beforeRetryRequests.length===0,'no API before Retry-After');
    while(!c.recheckAt)await delay(25);
    c.retryIntervalMs=c.recheckAt-c.rateAt;c.pausedDataRequests=c.requests.filter(r=>r.at>=c.rateAt&&r.path!=='metadata');save();
    assert(c.retryIntervalMs>=1000,'expiry recheck honors Retry-After');
    if(paused)assert(c.pausedDataRequests.length===0,'paused expiry does not resume messages/wait');
    c.pass=true;save();
   }finally{await ctx.close();save();}
  }
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();page.setDefaultTimeout(10000);
  try{
   const room=curl(base,'/api/rooms',token,'POST',{purpose:'창작 종료 안내',ttl_seconds:300}),cap=new URL(room.invite_url).pathname.split('/').at(-1),path=`/api/rooms/${room.room.id}`;
   const participant=curl(base,path+'/participants',cap,'POST',{nickname:'나래'});
   curl(base,path+'/messages',participant.participant_token,'POST',{text:'종료 후에도 남는 창작 메시지',client_message_id:'closed-contract-1'});
   await page.goto(room.invite_url);await page.waitForFunction(()=>document.querySelectorAll('.message').length===1);
   curl(base,path+'/close',room.owner_token,'POST');await page.waitForFunction(()=>document.querySelector('#watch-status')?.textContent.includes('종료'));
   const c=await page.evaluate(()=>({case:'real local owner close during invite watch',count:document.querySelectorAll('.message').length,roomStatus:document.querySelector('#room-status').textContent,scope:document.querySelector('#link-scope').textContent,permission:document.querySelector('#permission').textContent,share:document.querySelector('#share-description').textContent}));evidence.cases.push(c);save();
   assert(c.count===1&&c.roomStatus==='종료된 방'&&c.scope.includes('입장하거나 발신할 수 없어요'),'closed history retained and join unavailable');
   await page.locator('[data-tab=connect]').click();await page.evaluate(()=>document.querySelector('#shared-url').textContent=document.querySelector('#shared-url').textContent.replace(/[\w-]{43}$/,'A'.repeat(43)));
   await page.screenshot({path:out+'closed-invite.png',fullPage:false});c.pass=true;save();
  }finally{await ctx.close();}
  evidence.pass=true;save();console.log('TOKTOK_CONTRACT_TARGETED_PASS: expiry metadata 429 Retry-After/no early API in active and paused states, paused messages/wait0; real owner close retains invite history and removes join wording');
 }finally{save();if(browser)await browser.close();server.kill('SIGTERM');await stopped;}
}
main().catch(e=>{evidence.failure=e.message.replace(/[\w-]{43}/g,'[fixture-cap]');save();console.error(evidence.failure);process.exitCode=1;});
