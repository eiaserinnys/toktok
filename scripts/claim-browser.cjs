// Real local Worker/SQLite UI; only mail delivery, trusted local IP and clock use the test-only entry.
const fs=require('node:fs'),net=require('node:net');const {spawn}=require('node:child_process');
const {call}=require('./claim-fixture.cjs'),{chromium}=require(process.env.TOKTOK_PLAYWRIGHT_MODULE);
const root=require('node:path').resolve(__dirname,'..'),out=process.env.TOKTOK_BROWSER_OUT;
if(!out)throw Error('TOKTOK_BROWSER_OUT is required');
const evidence={scope:'OTP claim UI 1440/390, real Worker SQLite, test-only fake mail delivery/clock',observations:[],shots:[],errors:[],requests:[]};
const save=()=>fs.writeFileSync(out+'evidence.json',JSON.stringify(evidence,null,2)),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function record(page,label){const raw=await page.evaluate(()=>{const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,width:r.width,height:r.height};};return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,pageY:scrollY,active:document.activeElement?.id||document.activeElement?.tagName,conversation:rect('.conversation'),sidebar:rect('.room-sidebar'),dialog:rect('dialog[open]'),bodyOverflow:getComputedStyle(document.body).overflow,sessionState:document.querySelector('#identity-status')?.textContent,claimState:document.querySelector('#claim-state')?.textContent};});evidence.observations.push({label,...raw});save();return raw;}
async function check(page,value,label){await record(page,'assert: '+label);if(!value)throw Error(label);}
async function shot(page,name){await page.evaluate(()=>document.fonts.ready);const sensitive=await page.locator('#email-address,#otp-code').evaluateAll(es=>es.map(e=>e.value));await page.locator('#email-address,#otp-code').evaluateAll(es=>es.forEach(e=>e.value=''));const saved=await page.locator('.url-field code').evaluateAll(es=>es.map(e=>e.textContent));await page.locator('.url-field code').evaluateAll(es=>es.forEach(e=>e.textContent=e.textContent.replace(/[\w-]{43}/g,'A'.repeat(43))));await record(page,'before viewport: '+name);await page.screenshot({path:out+name+'.png',fullPage:false});await page.locator('.url-field code').evaluateAll((es,values)=>es.forEach((e,i)=>e.textContent=values[i]),saved);await page.locator('#email-address,#otp-code').evaluateAll((es,values)=>es.forEach((e,i)=>e.value=values[i]),sensitive);evidence.shots.push(name);save();}
async function main(){
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const base='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config','test/wrangler.jsonc','--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--var','PUBLIC_ORIGIN:'+base],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});server.stdout.resume();server.stderr.resume();let exited=false,browser;const stopped=new Promise(r=>server.once('exit',()=>{exited=true;r();}));
 try{
  let ready=false;for(let i=0;i<100&&!exited;i++){try{call(base,'/health');ready=true;break;}catch{}await delay(100);}if(!ready)throw Error('Worker ready');
  browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});evidence.browser=browser.version();
  const fixtureStart=Date.now();for(const width of [1440,390]){
   call(base,'/__fixture/control','POST',{now:fixtureStart+(width===390?3600000:0)});
   const ctx=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390}),page=await ctx.newPage();page.setDefaultTimeout(15000);
   page.on('request',r=>{const u=new URL(r.url());evidence.requests.push({width,method:r.method(),path:u.pathname.replace(/[\w-]{43}/g,'[cap]'),external:u.origin!==base});});
   page.on('pageerror',()=>evidence.errors.push({width,type:'pageerror'}));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Content Security Policy'))evidence.errors.push({width,type:'CSP'});});
   try{
    await page.goto(base+'/register');await page.waitForSelector('#registration-command');await shot(page,width+'-register');await check(page,(await page.locator('#registration-command').textContent()).includes('/api/agents'),'self-contained registration');
    const registered=call(base,'/api/agents','POST',{name:'봄날 창작 에이전트 '+width}).data,claim={agent_id:registered.agent.id,claim_token:new URL(registered.claim_url).pathname.split('/').at(-1)};
    await page.goto(registered.claim_url);await page.waitForFunction(()=>document.querySelector('#claim-state')?.textContent.includes('기다리고'));await shot(page,width+'-pending');
    await page.locator('#verify-human').click();await page.waitForSelector('#email-auth:visible');
    await check(page,await page.locator('#approve-claim').isHidden(),'pending cannot approve before email confirmation');
    await page.locator('#email-privacy').scrollIntoViewIfNeeded();await check(page,await page.locator('#email-privacy').isVisible()&&(await page.locator('#email-privacy').textContent()).includes('31일'),'email metadata privacy is visible');await shot(page,width+'-email-privacy');
    await page.locator('#email-address').fill('allowed@fixture.test');await page.locator('#send-email').click();await page.waitForSelector('#otp-field:visible');
    await shot(page,width+'-otp-cooldown');await check(page,await page.locator('#resend-email').isDisabled(),'120 second explicit resend cooldown');
    const inbox=call(base,'/__fixture/inbox?email=allowed%40fixture.test').data;const wrong=inbox.delivery.code==='000000'?'999999':'000000';
    await page.locator('#otp-code').fill(wrong);await page.locator('#verify-code').click();await page.waitForFunction(()=>document.querySelector('#email-status')?.textContent.includes('5회'));await shot(page,width+'-wrong-code');
    const limitedCtx=await browser.newContext({viewport:{width,height:width===390?844:1000}}),limited=await limitedCtx.newPage();try{
     await limited.goto(registered.claim_url);await limited.locator('#verify-human').click();await limited.locator('#email-address').fill('allowed@fixture.test');await limited.locator('#send-email').click();
     await limited.waitForFunction(()=>document.querySelector('#email-status')?.textContent.includes('한도'));await shot(limited,width+'-rate-limit');
     }finally{await limitedCtx.close();}
    await page.locator('#otp-code').fill(inbox.delivery.code);await page.locator('#verify-code').click();await page.waitForSelector('#approve-claim:visible');
    await shot(page,width+'-before-approval');const pending=call(base,'/api/agents/me','GET',undefined,{Authorization:'Bearer '+registered.agent_token}).data;await check(page,pending.agent.status==='pending','OTP login does not auto approve');
    await check(page,!(await page.locator('#risk-ack').isChecked()),'risk acknowledgement starts unchecked');await page.locator('#risk-ack').check();await page.locator('#approve-claim').click();await page.waitForFunction(()=>document.querySelector('#claim-state')?.textContent==='승인했습니다');await shot(page,width+'-approved');
    const mailBefore=call(base,'/__fixture/inbox?email=allowed%40fixture.test').data.calls;
    const secondAgent=call(base,'/api/agents','POST',{name:'로그인 유지 중 두 번째 agent '+width}).data;await page.goto(secondAgent.claim_url);await page.waitForSelector('#approve-claim:visible');await check(page,await page.locator('#email-auth').isHidden()&&await page.locator('#verify-human').isHidden(),'valid session second claim has no OTP UI');
    await page.locator('#risk-ack').check();await page.locator('#approve-claim').click();await page.waitForFunction(()=>document.querySelector('#claim-state')?.textContent==='승인했습니다');
    await check(page,call(base,'/__fixture/inbox?email=allowed%40fixture.test').data.calls===mailBefore,'second claim sends zero extra email');
    await page.goto(base+'/creator');await page.waitForSelector('#open-create:visible');await page.locator(`#agent-options input[value="${registered.agent.id}"]`).check();await shot(page,width+'-creator');
    await page.locator('#open-create').scrollIntoViewIfNeeded();const before=await record(page,width+' before modal');await page.locator('#open-create').click();await page.waitForSelector('#createDialog[open]');await record(page,width+' open modal');
    await check(page,await page.evaluate(()=>getComputedStyle(document.body).overflow==='hidden'&&document.activeElement.id==='roomName'),'modal background locked and input focus');await shot(page,width+'-create-modal');
    await page.locator('.close-dialog').click();await check(page,await page.evaluate(()=>document.activeElement.id==='open-create'),'modal focus restored');const closed=await record(page,width+' closed modal');await check(page,closed.pageY===before.pageY,'modal page position retained');
    await page.locator('#open-create').click();await page.locator('#roomName').fill('창작 실제 방 <img> '+width);await check(page,!(await page.locator('#create-risk-ack').isChecked()),'each create modal risk checkbox starts unchecked');await page.locator('#create-risk-ack').check();
    const createdResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/rooms'&&r.request().method()==='POST');await page.locator('#createForm [type=submit]').click();const response=await createdResponse,created=await response.json();await check(page,response.status()===201,'human owned agent creates room');await page.waitForSelector('#room-result:visible');await check(page,call(base,'/__fixture/inbox?email=allowed%40fixture.test').data.calls===mailBefore,'new room sends zero extra email');
    await check(page,!(await page.content()).includes(created.owner_token),'owner credential is memory only');await shot(page,width+'-result');
    const cdp=await browser.newBrowserCDPSession();try{
     const contexts=await cdp.send('Target.getBrowserContexts');const permission=async setting=>{for(const allowWithoutSanitization of [false,true])await cdp.send('Browser.setPermission',{permission:{name:'clipboard-write',allowWithoutSanitization},setting,origin:base,browserContextId:contexts.browserContextIds[0]});};
     await permission('granted');await page.locator('[data-copy=owner]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('관리 키를')&&getComputedStyle(document.querySelector('#toast')).opacity==='1');await check(page,true,'owner copy success separate from shared URLs');
     await permission('denied');await page.locator('[data-copy=read]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('자동 복사')&&getComputedStyle(document.querySelector('#toast')).opacity==='1');
     const selected=await page.locator('#read-result').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);return getSelection().toString()===e.textContent&&document.activeElement===e;});await check(page,selected,'shared URL selectable after real clipboard denial');await shot(page,width+'-copy-fallback');
    }finally{await cdp.detach();}
    const participant=call(base,`/api/rooms/${created.room.id}/participants`,'POST',{nickname:'창작 봄날'},{Authorization:'Bearer '+new URL(created.invite_url).pathname.split('/').at(-1)}).data;
    call(base,`/api/rooms/${created.room.id}/messages`,'POST',{text:'기존 관전 계약은 그대로예요. <script>도 평문이에요.',client_message_id:'claim-ui-'+width},{Authorization:'Bearer '+participant.participant_token});
    await page.goto(created.read_url);await page.waitForSelector('.message');await shot(page,width+'-spectator-unchanged');const metrics=await record(page,width+' spectator');await check(page,metrics.scrollWidth===width,'representative spectator no overflow');await check(page,await page.locator('.bubble script').count()===0,'representative spectator text is plain');
   }finally{await ctx.close();save();}
  }
  if(evidence.errors.length||evidence.requests.some(r=>r.external))throw Error('browser errors or external assets');
  evidence.pass=true;save();console.log('TOKTOK_OTP_CLAIM_BROWSER_PASS: 1440/390 register, pending/OTP cooldown/wrong code/rate limit/explicit approval, privacy31days, valid session second claim and room mail0, creator/modal/shared links, memory-only owner/clipboard denied, representative spectator; fake mail only');
 }finally{save();if(browser)await browser.close();server.kill('SIGTERM');await stopped;}
}
main().catch(e=>{evidence.failure=e.message.replace(/[\w-]{43}/g,'[cap]');save();console.error(evidence.failure);process.exitCode=1;});
