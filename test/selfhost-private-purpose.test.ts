import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initSnapshot} from '../src/private-state';
import {MAX_PRIVATE_PURPOSE_CHARACTERS} from '../src/private-contracts';
import {HttpError} from '../src/http';
import {privateSnapshot} from './selfhost-private-fixture';
test('private purpose retains zero through 1000 Unicode characters and rejects 1001',async()=>{
 const {snapshot}=await privateSnapshot('purpose-boundary',false);
 assert.equal(MAX_PRIVATE_PURPOSE_CHARACTERS,1000);
 for(const purpose of ['', '🙂'.repeat(1000)]){const result=await initSnapshot({...snapshot,purpose});assert.equal(result.snapshot.purpose,purpose);}
 await assert.rejects(initSnapshot({...snapshot,purpose:'🙂'.repeat(1001)}),e=>e instanceof HttpError&&e.status===400&&e.code==='INVALID_SNAPSHOT');
 console.log(JSON.stringify({phase:'purpose-boundary',allowed_unicode_characters:1000,rejected_unicode_characters:1001,status:400}));
});
