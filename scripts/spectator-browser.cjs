// Local SQLite Worker + curl participants + Chromium. No production credentials or URL/body logs.
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http'),crypto=require('node:crypto');
const playwright=process.env.TOKTOK_PLAYWRIGHT_MODULE;
if(!playwright)throw Error('TOKTOK_PLAYWRIGHT_MODULE is required');
const {chromium}=require(playwright);
const root=path.resolve(__dirname,'..'),out=process.env.TOKTOK_BROWSER_OUT;
if(!out)throw Error('TOKTOK_BROWSER_OUT is required');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(value,label)=>{if(!value)throw Error(label);};
const mobileRemaining=process.env.TOKTOK_BROWSER_SCOPE==='mobile-remaining';
const evidence={scope:mobileRemaining?'390 remaining only; root pause evidence adopted':'1440/390 integration',cases:[],requests:[],errors:[],shots:[],observations:[]};
const save=()=>fs.writeFileSync(out+'evidence.json',JSON.stringify(evidence,null,2));
async function record(page,label){evidence.observations.push({label,...await state(page)});save();}
const token='local-fixture-curl-creator';
function curl(base,route,cap,method='GET',body){
 const args=['--silent','--show-error','--fail-with-body','--max-time','8','-X',method,base+route];
 if(cap)args.push('-H','Authorization: Bearer '+cap);
 if(body!==undefined)args.push('-H','Content-Type: application/json','--data-binary',JSON.stringify(body));
 const r=spawnSync('curl',args,{encoding:'utf8',timeout:10000});
 if(r.status!==0)throw Error('local curl failed: '+method+' '+route.replace(/[\w-]{43}/g,'[fixture-cap]'));
 return r.stdout?JSON.parse(r.stdout):null;
}
function create(base,ttl=300){return curl(base,'/api/rooms',token,'POST',{purpose:'봄날의 작은 이야기 — 읽던 자리를 지켜요',ttl_seconds:ttl});}
const cap=url=>new URL(url).pathname.split('/').at(-1);
function join(base,r,name){return curl(base,`/api/rooms/${r.room.id}/participants`,cap(r.invite_url),'POST',{nickname:name});}
function send(base,r,p,text,id){return curl(base,`/api/rooms/${r.room.id}/messages`,p.participant_token,'POST',{text,client_message_id:id});}
async function count(page,n){await page.waitForFunction(n=>document.querySelectorAll('.message').length===n,n,{timeout:12000});}
async function state(page){return page.evaluate(()=>{const f=document.querySelector('#feed');return {sequences:[...document.querySelectorAll('.message')].map(e=>Number(e.dataset.sequence)),top:f?.scrollTop,max:f?f.scrollHeight-f.clientHeight:0,pageY:scrollY,status:document.querySelector('#watch-status')?.textContent,roomStatus:document.querySelector('#room-status')?.textContent,permission:document.querySelector('#permission')?.textContent};});}
async function shot(page,name){
 await page.evaluate(()=>document.fonts.ready);await delay(500);
 // Screenshots show a same-shape fictional capability, never even a minted local fixture secret.
 const saved=await page.locator('#shared-url').count()?await page.locator('#shared-url').textContent():null;
 if(saved)await page.locator('#shared-url').evaluate(e=>e.textContent=e.textContent.replace(/[\w-]{43}$/,'A'.repeat(43)));
 const file=out+name+'.png';await page.screenshot({path:file,fullPage:!mobileRemaining});evidence.shots.push({name,file,urlRedacted:!!saved});
 if(saved)await page.locator('#shared-url').evaluate((e,s)=>e.textContent=s,saved);
}
async function metrics(page){return page.evaluate(()=>{
 const rect=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:b.x,y:b.y,right:b.right,width:b.width,height:b.height,font:c.fontSize,color:c.color,padding:c.padding,gap:c.gap,radius:c.borderRadius};};
 return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,header:rect('.header'),room:rect('.room-layout'),conversation:rect('.conversation'),sidebar:rect('.room-sidebar'),bubble:rect('.bubble'),meta:rect('.message-meta>span'),people:[...document.querySelectorAll('.person')].map(e=>({initial:e.querySelector('.avatar').textContent,name:e.querySelector('strong').textContent,color:getComputedStyle(e.querySelector('.avatar')).backgroundColor})),messages:[...document.querySelectorAll('.message')].slice(0,2).map(e=>({initial:e.querySelector('.avatar').textContent,name:e.querySelector('strong').textContent,color:getComputedStyle(e.querySelector('.avatar')).backgroundColor})),fonts:[...document.fonts].map(f=>({family:f.family,status:f.status}))};
});}
async function main(){
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const base='http://127.0.0.1:'+port;
 const registry=JSON.stringify([{creator_id:'local-curl',token_sha256:crypto.createHash('sha256').update(token).digest('hex'),enabled:true}]);
 const server=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--var','PUBLIC_ORIGIN:'+base,'--var','CREATOR_CREDENTIALS_JSON:'+registry],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});server.stdout.resume();server.stderr.resume();
 const design=process.env.TOKTOK_DESIGN_PROTOTYPE;
 if(!design||!path.isAbsolute(design))throw Error('TOKTOK_DESIGN_PROTOTYPE requires an absolute read-only prototype path');
 const reference=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(design,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(design+'/')){res.writeHead(404);res.end();return;}
  let data;try{if(['/styles.css','/app.js'].includes(pathname))data=spawnSync('git',['-C',root,'show','a78acce0:design/prototype'+pathname],{encoding:'utf8'}).stdout;else data=fs.readFileSync(file);}catch{res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.css':'text/css','.js':'application/javascript','.woff':'font/woff','.html':'text/html','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream'});res.end(data);
 });
 await new Promise(r=>reference.listen(0,'127.0.0.1',r));const designBase='http://127.0.0.1:'+reference.address().port;
 let exited=false;const stopped=new Promise(r=>server.once('exit',()=>{exited=true;r();}));let browser;
 try{
  let ready=false;for(let i=0;i<150&&!exited;i++){try{curl(base,'/health');ready=true;break;}catch{}await delay(100);}assert(ready,'Worker ready');
  const expiry=create(base,60);
  browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});evidence.browser=browser.version();
  for(const width of mobileRemaining?[390]:[1440,390]){
   const mode=width===390?'mobile':'desktop',ctx=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,deviceScaleFactor:1});
   const page=await ctx.newPage();page.setDefaultTimeout(10000);
   page.on('request',r=>{const u=new URL(r.url());evidence.requests.push({mode,method:r.method(),path:u.pathname.replace(/[\w-]{43}/g,'[fixture-cap]'),after:u.searchParams.get('after'),external:u.origin!==base});});
   page.on('pageerror',()=>evidence.errors.push({mode,type:'pageerror'}));
   page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Content Security Policy'))evidence.errors.push({mode,type:'CSP'});});
   const r=create(base),a=join(base,r,'<b>봄날</b>'),b=join(base,r,'귤빛 친구');
   if(!mobileRemaining){await page.goto(r.invite_url);await page.waitForFunction(()=>document.querySelector('#permission')?.textContent==='초대 링크 · 관전');
   }
   await page.goto(r.read_url);await page.waitForFunction(()=>document.querySelector('#room-status')?.textContent==='대화를 기다리는 중');if(!mobileRemaining)await shot(page,mode+'-empty');
   for(let i=0;i<3;i++){send(base,r,a,`창작 ${i}: <img src=x onerror="globalThis.injected=true">\n**강조도 평문**으로 읽어요.`,mode+'-a-'+i);send(base,r,b,`창작 답변 ${i}: 똠방각하와 뷁, 쀍까지 로컬 한글 폰트로 표시해요.`,mode+'-b-'+i);}
   await count(page,6);if(!mobileRemaining){assert(await page.locator('.bubble img').count()===0,'plain unsafe text');assert(await page.locator('.person').count()===2,'actual sender count');}
   for(let i=0;i<10;i++)send(base,r,i%2?a:b,('읽던 위치를 유지하는 긴 한글 문장입니다. 새로운 대화가 와도 이 자리를 지킵니다.\n').repeat(4),mode+'-scroll-'+i);
   await count(page,16);await page.locator('#feed').evaluate(e=>e.scrollTop=120);await page.evaluate(()=>scrollTo({top:100,behavior:'instant'}));await delay(100);
   if(!mobileRemaining){await shot(page,mode+'-room');const m=await metrics(page);assert(m.scrollWidth===width,'horizontal overflow');assert(m.meta.color==='rgb(95, 109, 86)','final badge color');assert(m.people.every((p,i)=>p.initial===Array.from(p.name)[0]&&p.color===m.messages[i].color),'sender avatar agreement');evidence.cases.push({mode,case:'empty/three curl round trips/unsafe text/local font/avatar/room',metrics:m});
   // Read-only selected-design comparison, not a repeat of prototype QA.
   const ref=await ctx.newPage();await ref.goto(designBase+'/#room');await ref.evaluate(()=>document.querySelector('[data-action=pause]').click());
   const same=await page.evaluate(()=>({title:document.querySelector('#room-title').textContent,feed:document.querySelector('#feed').innerHTML,people:document.querySelector('#people').innerHTML}));
   await ref.evaluate(data=>{document.querySelectorAll('.studio-bar,.prototype-disclaimer,.typing').forEach(e=>e.remove());document.querySelector('.room-title-row h1').textContent=data.title;document.querySelector('#feed').innerHTML=data.feed;const people=document.querySelector('.room-people');people.innerHTML='<span class="eyebrow">AT THE TABLE</span><h2>발언한 사람</h2>'+data.people;document.querySelector('#feed').scrollTop=120;},same);
   await ref.evaluate(()=>document.fonts.ready);await delay(500);
   const designMetrics=await metrics(ref);const designShot=out+mode+'-design-same-content.png';await ref.screenshot({path:designShot,fullPage:true});
   for(const selector of ['bubble','conversation'])for(const key of ['font','padding','radius'])assert(m[selector][key]===designMetrics[selector][key],'design token '+selector+' '+key);
   evidence.cases.push({mode,case:'a78acce selected design / integration side by side with same fictional message content',referenceScreenshot:designShot,referenceMetrics:designMetrics,note:'Reference only: paused prototype; review rail removed and title/feed/people filled with identical local fiction. Remaining prototype labels are design context, not product evidence.'});
   await ref.close();
   const before=await state(page);await record(page,'before pause');await page.locator('[data-action=pause]').evaluate(e=>e.click());const paused=await state(page);await record(page,'paused');assert(paused.top===before.top&&paused.pageY===before.pageY,'pause position');
   send(base,r,a,'일시정지 중 추가한 창작 메시지',mode+'-paused');await delay(350);assert((await state(page)).sequences.length===16,'paused cursor');await shot(page,mode+'-paused-reading');
   await page.locator('[data-action=pause]').evaluate(e=>e.click());await count(page,17);const resumed=await state(page);await record(page,'resumed before assertion');assert(resumed.top===before.top&&resumed.pageY===before.pageY,'resume read position');assert(resumed.sequences.every((n,i)=>n===i+1),'no missing/duplicate');evidence.cases.push({mode,case:'pause/resume',before,paused,resumed});}
   else{send(base,r,a,'로컬 fixture 입력 17',mode+'-input17');await count(page,17);await page.locator('#feed').evaluate(e=>e.scrollTop=120);await page.evaluate(()=>scrollTo({top:600,behavior:'instant'}));await delay(100);}
   const position=await state(page);await record(page,'remaining baseline');
   await ctx.setOffline(true);await page.waitForFunction(()=>document.querySelector('#watch-status')?.textContent.includes('끊겼'),null,{timeout:35000});await shot(page,mode+'-error');const disconnected=await state(page);await record(page,'disconnected before assertion');send(base,r,b,'끊김 동안 추가한 창작 답변',mode+'-offline');await ctx.setOffline(false);await count(page,18);const reconnected=await state(page);await record(page,'reconnected before assertion');assert(reconnected.top===position.top,'reconnect read position');evidence.cases.push({mode,case:'disconnect/resume same cursor',disconnected,reconnected});
   await page.locator('[data-action=pause]').evaluate(e=>e.click());
   const cdp=await browser.newBrowserCDPSession();try{
    const ids=await cdp.send('Target.getBrowserContexts');for(const allowWithoutSanitization of [false,true])await cdp.send('Browser.setPermission',{permission:{name:'clipboard-write',allowWithoutSanitization},setting:'denied',origin:base,browserContextId:ids.browserContextIds[0]});
    assert(await page.evaluate(async()=>(await navigator.permissions.query({name:'clipboard-write'})).state)==='denied','actual clipboard denial');await page.locator('.invite-btn').evaluate(e=>e.click());await page.waitForFunction(()=>!document.querySelector('#connect-panel').hidden);assert((await page.locator('#link-scope').textContent()).includes('읽기만'),'read scope');
    const selectable=await page.locator('#shared-url').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString()===e.textContent;});assert(selectable,'long URL selectable');await shot(page,mode+'-clipboard-fallback');evidence.cases.push({mode,case:'real clipboard denied/read scope/long URL',selectable});
   }finally{await cdp.detach();}
   await page.locator('[data-tab=chat]').evaluate(e=>e.click());await record(page,'chat tab restored before assertion');assert((await state(page)).top===position.top,'tab read position');
   // Controlled HTTP 429 at the browser boundary; SQLite and permissions remain real.
   // Production rate-limit emission is covered by the foundation CI, not relaxed for this harness.
   let limited=false;const retryTimes=[];
   await page.route('**/api/rooms/*/wait?*',async route=>{retryTimes.push(Date.now());if(!limited){limited=true;await route.fulfill({status:429,headers:{'Content-Type':'application/json','Retry-After':'1'},body:JSON.stringify({error:{code:'RATE_LIMITED',message:'창작 제한 시험'}})});}else await route.continue();});
   await page.locator('[data-action=pause]').evaluate(e=>e.click());
   await page.waitForFunction(()=>document.querySelector('#watch-status')?.textContent.includes('잠시 기다려'));await shot(page,mode+'-rate-limit');
   for(let i=0;i<30&&retryTimes.length<2;i++)await delay(100);
   assert(retryTimes.length>=2&&retryTimes[1]-retryTimes[0]>=990,'Retry-After honored');
   evidence.cases.push({mode,case:'controlled 429 retains feed/retries after HTTP delay',retryDelay:retryTimes[1]-retryTimes[0]});
   await page.unroute('**/api/rooms/*/wait?*');await record(page,'after controlled 429');
   curl(base,`/api/rooms/${r.room.id}/close`,r.owner_token,'POST');await page.waitForFunction(()=>document.querySelector('#watch-status')?.textContent.includes('종료'));await count(page,18);await shot(page,mode+'-closed');evidence.cases.push({mode,case:'closed history preserved',state:await state(page)});
   const invalid=r.read_url.replace(/[\w-]{43}$/,'x'.repeat(43));const invalidResponse=await page.goto(invalid);assert(invalidResponse.status()===403,'invalid HTML status');await page.waitForSelector('.expired-page');await shot(page,mode+'-invalid');
   // Actual expiry, not a mocked screen. Created before this execution group.
   const remaining=Date.parse(expiry.room.expires_at)-Date.now();if(remaining>0)await delay(remaining+100);
   const expiredResponse=await page.goto(expiry.read_url);assert(expiredResponse.status()===410,'expiry HTML status');await page.waitForSelector('.expired-page');assert(await page.locator('.message').count()===0,'gone removes feed');await shot(page,mode+'-expired');evidence.cases.push({mode,case:'invalid/expired HTTP status and empty expired surface',invalid:403,expired:410});
   await ctx.close();
  }
  assert(!evidence.errors.length,'browser/CSP errors');assert(!evidence.requests.some(r=>r.external),'self assets only');assert(evidence.requests.filter(r=>r.path.startsWith('/api/')).every(r=>r.method==='GET'),'browser performs only GET');
  evidence.pass=true;save();console.log(mobileRemaining?'TOKTOK_SPECTATOR_MOBILE_REMAINING_PASS: 390 reconnect/cursor, real clipboard denied, controlled 429 Retry-After, closed/expired, GET-only, CSP/self assets; root pause evidence adopted':'TOKTOK_SPECTATOR_BROWSER_PASS: 1440/390, curl 3 round trips, pause/read position, reconnect cursor, readonly, local assets/CSP, close/expiry, real clipboard denied');
 }finally{
  fs.writeFileSync(out+'evidence.json',JSON.stringify(evidence,null,2));if(browser)await browser.close();server.kill('SIGTERM');await stopped;await new Promise(r=>reference.close(r));
 }
}
main().catch(e=>{evidence.failure=e.message.replace(/[\w-]{43}/g,'[fixture-cap]');save();console.error(e.message.replace(/[\w-]{43}/g,'[fixture-cap]'));process.exitCode=1;});
