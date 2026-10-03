import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HttpError} from '../src/http';
import {publicError,PublicError} from '../src/public-http';
test('public error preserves generic budget seconds and local millisecond retry',async()=>{
 const global=Object.assign(new HttpError(429,'BUDGET_EXHAUSTED','mock'),{retryAfter:17});const response=publicError(global);assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'17');const data=await response.json() as {error:{retry_after_ms:number;code:string}};assert.equal(data.error.retry_after_ms,17000);assert.equal(data.error.code,'BUDGET_EXHAUSTED');
 const local=publicError(Object.assign(new PublicError(429,'RATE_LIMITED','mock',1250),{retryAfter:17}));assert.equal(local.headers.get('Retry-After'),'2');assert.equal((await local.json() as {error:{retry_after_ms:number}}).error.retry_after_ms,1250);console.log(JSON.stringify({phase:'budget-retry',generic_seconds:17,generic_ms:17000,local_header_seconds:2,local_ms:1250}));
});
