export function createGalleryState(length){
 let index=null;
 const valid=raw=>{if(typeof raw==='string'&&!/^(0|[1-9][0-9]*)$/.test(raw))return null;if(typeof raw!=='number'&&typeof raw!=='string')return null;const n=Number(raw);return Number.isSafeInteger(n)&&n>=0&&n<length?n:null;};
 return {get index(){return index;},open(raw){const n=valid(raw);if(n===null)return false;index=n;return true;},step(direction){if(index===null||![-1,1].includes(direction))return false;return this.open(index+direction);}};
}
