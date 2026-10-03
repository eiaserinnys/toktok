import {it,expect} from 'vitest';
import {waitPreviewReady} from '../public/admin-design/preview-ready.js';
it('waits for canonical CSS, the resulting fonts and frame images before preview readiness',async()=>{
 const style=new EventTarget(),image=new EventTarget();let fonts,finished=false;
 const document={body:{getBoundingClientRect:()=>({})},fonts:{ready:new Promise(r=>fonts=r)},images:[image]};
 const ready=waitPreviewReady(document,style,1000).then(()=>finished=true);
 await Promise.resolve();expect(finished).toBe(false);style.dispatchEvent(new Event('load'));await Promise.resolve();expect(finished).toBe(false);fonts();await Promise.resolve();expect(finished).toBe(false);image.complete=true;image.naturalWidth=1;image.dispatchEvent(new Event('load'));await ready;expect(finished).toBe(true);
});
it('fails closed with bounded timeout or broken preview image instead of claiming unstyled readiness',async()=>{
 const doc={body:{getBoundingClientRect:()=>({})},fonts:{ready:Promise.resolve()},images:[]};
 await expect(waitPreviewReady(doc,new EventTarget(),10)).rejects.toThrow('PREVIEW_RESOURCE_TIMEOUT');
 await expect(waitPreviewReady({...doc,images:[{complete:true,naturalWidth:0}]},{sheet:{}},1000)).rejects.toThrow('PREVIEW_IMAGE_UNAVAILABLE');
});
