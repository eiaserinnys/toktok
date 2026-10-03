import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fixture,status,type Message} from './private-http-fixture';
const {chromium}=createRequire(import.meta.url)(process.env.TOKTOK_PLAYWRIGHT_MODULE || '@playwright/test');
const out=process.env.TOKTOK_BROWSER_OUTPUT || '.local/private-lifetime-browser';mkdirSync(out,{recursive:true});
for(const width of [390,1440])test('actual private lifetime guidance tail '+width,async t=>{
 const f=await fixture(t),browser=await chromium.launch({headless:true,args:['--no-sandbox']}),result:{width:number;checks:string[];shots:string[];errors:number;cleanup:boolean}={width,checks:[],shots:[],errors:0,cleanup:false};
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',()=>result.errors++);
 t.after(async()=>{await browser.close();result.cleanup=true;writeFileSync(out+'/'+width+'-raw.json',JSON.stringify(result,null,2));});
 async function shot(name:string){await page.evaluate(()=>document.fonts.ready);const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,bodyFont:parseFloat(getComputedStyle(document.body).fontSize)}));assert.equal(metrics.overflow,false);assert(metrics.bodyFont>=12);await page.screenshot({path:out+'/'+width+'-'+name+'.png',fullPage:true});result.shots.push(name);}
 await page.goto(f.origin+'/new-room');await page.locator('[data-private-lifetime]').waitFor();assert.match(await page.locator('[data-private-lifetime]').innerText(),/24시간/);assert.equal(await page.locator('[name=ttl_seconds]').count(),0);await shot('anonymous-24h');result.checks.push('anonymous lifetime and consent visible');
 const headers=await f.session();await context.addCookies([{name:'__Host-toktok_session',value:headers.Cookie.split('=')[1],domain:'localhost',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
 await page.reload();await page.locator('[data-private-lifetime]').waitFor();assert.match(await page.locator('[data-private-lifetime]').innerText(),/소유자가 닫을 때까지/);await page.locator('#roomPurpose').fill('가상 검증 · 상설 비공개방');await shot('member-permanent');
 await page.locator('#ownerRisk').check();const response=page.waitForResponse(r=>r.url()===f.origin+'/api/v1/rooms'&&r.request().method()==='POST');await page.locator('button[type=submit]').click();const created=await response;assert.equal(created.status(),201);const value=await created.json();assert.equal(value.room.expires_at,null);assert.equal(value.room.lifetime,'member_permanent');await page.locator('#createdRead').waitFor();
 assert.equal(await page.locator('body').innerText().then(s=>s.includes(value.owner_token)),false);await page.locator('#createdRead').evaluate(e=>e.textContent=e.textContent.replace(/[\w-]{43}$/,'r'.repeat(43)));await page.locator('#createdInvite').evaluate(e=>e.textContent=e.textContent.replace(/[\w-]{43}$/,'i'.repeat(43)));await shot('created-permanent');result.checks.push('actual context grant create201, null expiry, secret absent');
 const owned={...value,base:'/api/v1/rooms/'+value.room.id,invite:new URL(value.invite_url).pathname.split('/').at(-1),read:new URL(value.read_url).pathname.split('/').at(-1)},p=await f.participate(owned);status(await f.call<Message>('browser fixture message',owned.base+'/messages','POST',{text:'이 문장은 로컬 화면 검증용 가상 대화입니다.',client_message_id:'browser-fixture'},p.participant.participant_token),201,'write');
 await page.goto(value.read_url);await page.locator('#feed .message').waitFor();assert.match(await page.locator('#expiry').innerText(),/소유자가 닫을 때까지/);assert.equal(await page.locator('#lifetime-title').innerText(),'소유자가 닫을 때까지');assert.match(await page.locator('#lifetime-description').innerText(),/보관 기간은 방 수명과 별개/);assert.equal(await page.locator('.room-details').innerText().then(s=>s.includes('시간이 다 되면')),false);assert.match(await page.locator('#feed').innerText(),/가상 대화/);
 if(await page.locator('#shared-url').count())await page.locator('#shared-url').evaluate(e=>e.textContent=e.textContent.replace(/[\w-]{43}$/,'r'.repeat(43)));await shot('permanent-conversation');result.checks.push('actual private snapshot, latest message, no false expiry');
 // Dispose the browser wait before owner cleanup; no public message or operating identity is used.
 await page.goto(f.origin+'/about');status(await f.call('local browser room cleanup',owned.base,'DELETE',undefined,value.owner_token),204,'cleanup');assert.equal(result.errors,0);
 console.log('PRIVATE_LIFETIME_BROWSER '+JSON.stringify({width,checks:result.checks,errors:result.errors}));
});
