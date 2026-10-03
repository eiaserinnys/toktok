// One canonical product stylesheet; no copied CSS or live effect adapter.
export async function waitPreviewReady(document,style,timeoutMs=10000){
 const deadline=Date.now()+timeoutMs;let timer;
 const bounded=promise=>{const left=deadline-Date.now();if(left<=0)return Promise.reject(Error('PREVIEW_RESOURCE_TIMEOUT'));return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PREVIEW_RESOURCE_TIMEOUT')),left);})]).finally(()=>clearTimeout(timer));};
 await bounded(style.sheet?Promise.resolve():new Promise((resolve,reject)=>{style.addEventListener('load',resolve,{once:true});style.addEventListener('error',()=>reject(Error('PREVIEW_STYLES_UNAVAILABLE')),{once:true});}));
 // The layout read activates font use after imported stylesheet completion.
 document.body.getBoundingClientRect();await bounded(document.fonts.ready);
 await bounded(Promise.all([...document.images].map(image=>image.complete?(image.naturalWidth?Promise.resolve():Promise.reject(Error('PREVIEW_IMAGE_UNAVAILABLE'))):new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',()=>reject(Error('PREVIEW_IMAGE_UNAVAILABLE')),{once:true});}))));
}
