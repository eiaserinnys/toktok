import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fixture} from './private-http-fixture';
import {hash} from '../src/http';
import {RecordCollection as C} from '../src/storage/repository';
const {chromium}=createRequire(import.meta.url)(process.env.TOKTOK_PLAYWRIGHT_MODULE || '@playwright/test');
const out=process.env.TOKTOK_BROWSER_OUTPUT || '.local/private-lifetime-qa';mkdirSync(out,{recursive:true});
for(const width of [390,1440])test('actual protected shared private lifetime flow '+width,async t=>{
 const f=await fixture(t),h=await f.session();const token=h.Cookie.split('=')[1];
 // Fictional local reviewer only; this fixture never contacts production or email.
 await f.repo.transaction('control',async tx=>{const s=(await tx.get(C.sessions,await hash(token)))!,key='a:'+s.owner_id,a=(await tx.get(C.accounts,key))!;await tx.put(C.accounts,key,{...a,role:'admin'});});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),ctx=await browser.newContext({viewport:{width,height:900}});await ctx.addCookies([{name:'__Host-toktok_session',value:token,domain:'localhost',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);const page=await ctx.newPage();page.setDefaultTimeout(15000);
 const result={width,apiCalls:0,pageErrors:0,pass:false,cleanup:false};page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))result.apiCalls++;});page.on('pageerror',()=>result.pageErrors++);t.after(async()=>{await browser.close();result.cleanup=true;writeFileSync(out+'/'+width+'-raw.json',JSON.stringify(result,null,2));});
 assert.equal((await page.goto(f.origin+'/admin/design/flows')).status(),200);
 for(const id of ['newroom-anonymous','newroom-member','newroom-created-demo','newroom-created-recent']){
  await page.waitForFunction(id=>[...document.querySelectorAll('.flow-node')].some(n=>n.dataset.node?.split('@')[0]===id&&n.querySelector('iframe')?.dataset.previewReady==='true'),id);
  const text=await page.evaluate(id=>[...document.querySelectorAll('.flow-node')].find(n=>n.dataset.node?.split('@')[0]===id).querySelector('iframe').contentDocument.body.innerText,id);
  assert.match(text,id==='newroom-created-demo'?/2026-10-04T00:00:00.000Z 만료/:/24시간|소유자가 닫을 때까지/);if(id==='newroom-member')assert.match(text,/데모 예산/);
 }
 assert.equal(result.apiCalls,0);assert.equal(result.pageErrors,0);result.pass=true;await page.screenshot({path:out+'/'+width+'-shared-flow.png'});console.log('PRIVATE_LIFETIME_QA '+JSON.stringify(result));
});
