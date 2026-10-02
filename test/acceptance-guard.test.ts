import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
// Run in Node, outside the Workers pool. Deliberately missing sequence 7 must fail the real receiver verdict.
it('curl acceptance rejects a seeded sequence gap without advancing the saved cursor',()=>{
  const program = `import json, runpy
m=runpy.run_path('scripts/acceptance.py')
Client=m['Client']
client=Client.__new__(Client)
client.base='http://localhost:1/api/rooms/fixture'
client.token='local-fixture'
client.cursor=6
Client.receive.__globals__['curl']=lambda *a,**k: json.dumps({'messages':[{'sequence':8}], 'cursor':8})
try: client.receive()
except AssertionError:
    assert client.cursor == 6
    print('VERDICT_RED_CONFIRMED')
else: raise SystemExit(1)
`;
  expect(execFileSync('python3',['-c',program],{timeout:5000}).toString()).toContain('VERDICT_RED_CONFIRMED');
});
