import {it,expect} from 'vitest';
import verifier from '../scripts/public-ui-verifier.cjs';
it('rejects previous rendered text as evidence of a new accepted message',()=>{
 const row=(sequence,text)=>({dataset:{sequence:String(sequence)},querySelector:()=>({textContent:text})});
 const expected={sequence:2,text:'같은 창작 문장'};
 expect(verifier.observesMessage(expected,[row(1,expected.text)])).toBe(false);
 expect(verifier.observesMessage(expected,[row(2,'다른 문장')])).toBe(false);
 expect(verifier.observesMessage(expected,[row(1,expected.text),row(2,expected.text)])).toBe(true);
});
