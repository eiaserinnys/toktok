const clone=value=>structuredClone(value);
const parts=path=>path.split('.');
const get=(object,path)=>parts(path).reduce((value,key)=>value?.[key],object);
const fixedWorkload=path=>/^budget\.workloadCaps\.\d+\.(kind|unit)$/.test(path);
function schemaAt(schema,path){
 let node=schema;
 for(const key of parts(path))node=node?.type==='array'?node.items:node?.fields?.[key];
 if(!node)throw Error('UNKNOWN_SETTING');return node;
}
function validate(node,value){
 if(node.constant!==undefined&&value!==node.constant)throw Error('READ_ONLY_SETTING');
 if(node.type==='integer'){
  if(!Number.isSafeInteger(value)||value<node.min||value>node.max)throw Error('SETTING_OUT_OF_RANGE');
 }else if(node.type==='boolean'){if(typeof value!=='boolean')throw Error('INVALID_SETTING');}
 else if(node.type==='enum'){if(!node.values.includes(value))throw Error('INVALID_SETTING');}
 else if(node.type==='string'){
  if(typeof value!=='string'||Array.from(value).length<node.min||Array.from(value).length>node.max||(node.pattern&&!new RegExp(node.pattern).test(value)))throw Error('INVALID_SETTING');
 }else if(node.type==='array'){
  if(!Array.isArray(value)||value.length<node.min||value.length>node.max)throw Error('SETTING_OUT_OF_RANGE');
  for(const child of value)validate(node.items,child);
  if(node.boundsByKind){for(const cap of value){const bound=node.boundsByKind[cap.kind];if(!bound||cap.unit!==bound.unit||cap.day>bound.dayMax||cap.month>bound.monthMax||cap.day>cap.month)throw Error('SETTING_OUT_OF_RANGE');}}
 }else if(node.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(node.fields,key)))throw Error('INVALID_SETTING');
  for(const [key,child] of Object.entries(node.fields))validate(child,value[key]);
 }else throw Error('INVALID_SCHEMA');
}
const display=value=>value===undefined?'확인 필요':value===false?'OFF':value===true?'ON':typeof value==='object'?`${Array.isArray(value)?value.length:Object.keys(value).length}개`:String(value);
function difference(schema,before,after,path='',output=[]){
 if(JSON.stringify(before)===JSON.stringify(after))return output;
 if(schema.type==='object')for(const [key,node] of Object.entries(schema.fields))difference(node,before?.[key],after?.[key],path?path+'.'+key:key,output);
 else if(schema.type==='array'&&before?.length===after?.length)before.forEach((value,index)=>difference(schema.items,value,after[index],path+'.'+index,output));
 else output.push({path,label:schema.label,before:display(before),after:display(after),applyTo:schema.applyTo});
 return output;
}
export function createSettingsModel(envelope){
 if(!Number.isSafeInteger(envelope?.revision)||envelope.schema?.type!=='object'||!envelope.settings)throw Error('INVALID_SETTINGS_RESOURCE');
 let baseline=clone(envelope),draft=clone(envelope.settings),latest=null,seq=0;
 let rowIds=(draft.public?.catalog||[]).map(()=>++seq),baselineRowIds=[...rowIds];
 const snapshot=()=>({...clone(baseline),settings:clone(draft)});
 const review=()=>({revision:baseline.revision,changes:difference(baseline.schema,baseline.settings,draft)});
 return {
  snapshot,review,catalogRowIds:()=>[...rowIds],
  set(path,value){
   const node=schemaAt(baseline.schema,path);
   if(node.readOnly||fixedWorkload(path)||node.type==='array'||node.type==='object')throw Error('READ_ONLY_SETTING');
   validate(node,value);const keys=parts(path),last=keys.pop(),parent=keys.reduce((value,key)=>value?.[key],draft);
   if(!parent||!Object.hasOwn(parent,last))throw Error('UNKNOWN_SETTING');parent[last]=value;
  },
  addCatalog(){
   const node=schemaAt(baseline.schema,'public.catalog'),rows=draft.public.catalog;
   if(rows.length>=node.max)throw Error('SETTING_OUT_OF_RANGE');
   // An unfilled editor row, not a production default or automatic save.
   rows.push({slug:'',title:'',enabled:false});
   rowIds.push(++seq);
  },
  removeCatalog(index){
   const node=schemaAt(baseline.schema,'public.catalog'),rows=draft.public.catalog;
   if(!Number.isSafeInteger(index)||index<0||index>=rows.length)throw Error('UNKNOWN_SETTING');
   if(rows.length<=node.min)throw Error('SETTING_OUT_OF_RANGE');rows.splice(index,1);rowIds.splice(index,1);
  },
  validate(){validate(baseline.schema,draft);if(draft.budget?.warningUsd>draft.budget?.cutoffUsd||draft.budget?.cutoffUsd>draft.budget?.targetUsd)throw Error('SETTING_OUT_OF_RANGE');if(draft.public?.catalog&&new Set(draft.public.catalog.map(row=>row.slug)).size!==draft.public.catalog.length)throw Error('DUPLICATE_ROOM_PATH');},
  cancel(){draft=clone(baseline.settings);rowIds=[...baselineRowIds];},
  acceptLatest(envelope){if(!Number.isSafeInteger(envelope?.revision)||!envelope.settings||envelope.schema?.type!=='object')throw Error('INVALID_SETTINGS_RESOURCE');latest=clone(envelope);},
  conflict(){return {baseRevision:baseline.revision,latestRevision:latest?.revision,
   changes:review().changes.map(change=>({...change,draft:change.after,latest:display(latest?get(latest.settings,change.path):undefined)}))};},
  reloadLatest(){if(!latest)throw Error('LATEST_SETTINGS_UNAVAILABLE');baseline=latest;latest=null;draft=clone(baseline.settings);rowIds=(draft.public?.catalog||[]).map(()=>++seq);baselineRowIds=[...rowIds];},
  acceptSaved(envelope){if(!Number.isSafeInteger(envelope?.revision)||!envelope.settings)throw Error('INVALID_SETTINGS_RESOURCE');baseline={...baseline,...clone(envelope)};draft=clone(baseline.settings);latest=null;baselineRowIds=[...rowIds];}
 };
}
