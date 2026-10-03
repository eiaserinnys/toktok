import {it,expect} from 'vitest';
import {DEFAULT_SETTINGS,SETTINGS_SCHEMA,validateSettings,type SchemaNode,type WorkloadCap} from '../src/settings-schema';

const capSchema=()=>{
 const field=(...path:string[])=>path.reduce((node,key)=>{if(node.type!=='object')throw Error('schema object expected');return node.fields[key];},SETTINGS_SCHEMA as SchemaNode);
 const node=field('budget','workloadCaps');if(node.type!=='array')throw Error('cap array expected');return node;
};
const candidate=(cap:WorkloadCap)=>{
 const settings=structuredClone(DEFAULT_SETTINGS);settings.budget.workloadCaps=settings.budget.workloadCaps.map(c=>c.kind===cap.kind?cap:c);return settings;
};
it('workload cap metadata exports kind-specific source bounds, not current configured values',()=>{
 // Exercise the JSON form delivered by SettingsSchemaResponse, without runtime or database fixtures.
 const node=JSON.parse(JSON.stringify(capSchema())) as {boundsByKind?:Record<string,{unit:string;dayMax:number;monthMax:number}>};
 expect(node.boundsByKind).toEqual(Object.fromEntries(DEFAULT_SETTINGS.budget.workloadCaps.map(c=>[c.kind,{unit:c.unit,dayMax:c.day,monthMax:c.month}])));
 for(const source of DEFAULT_SETTINGS.budget.workloadCaps){
  const reduced=validateSettings(candidate({...source,day:1,month:1}));expect(reduced.budget.workloadCaps.find(c=>c.kind===source.kind)?.day).toBe(1);
  expect(node.boundsByKind?.[source.kind]).toEqual({unit:source.unit,dayMax:source.day,monthMax:source.month});
 }
});
it('workload cap validator accepts source maxima and rejects each kind-specific overflow or unit mismatch',()=>{
 for(const source of DEFAULT_SETTINGS.budget.workloadCaps){
  expect(validateSettings(candidate(source)).budget.workloadCaps.find(c=>c.kind===source.kind)).toEqual(source);
  for(const invalid of [{...source,day:source.day+1},{...source,month:source.month+1},{...source,unit:source.unit==='count'?'bytes' as const:'count' as const}])expect(()=>validateSettings(candidate(invalid))).toThrow();
 }
});
it('workload schema keeps its item shape and generic envelope agrees with source bounds',()=>{
 const node=capSchema();expect(node.min).toBe(DEFAULT_SETTINGS.budget.workloadCaps.length);expect(node.max).toBe(DEFAULT_SETTINGS.budget.workloadCaps.length);
 expect(node.items.type).toBe('object');if(node.items.type!=='object')throw Error('cap object expected');
 expect(Object.keys(node.items.fields)).toEqual(['kind','unit','day','month']);
 expect(node.items.fields.day.max).toBe(Math.max(...DEFAULT_SETTINGS.budget.workloadCaps.map(c=>c.day)));
 expect(node.items.fields.month.max).toBe(Math.max(...DEFAULT_SETTINGS.budget.workloadCaps.map(c=>c.month)));
});
