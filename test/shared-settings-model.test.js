import {it,expect} from 'vitest';
import {createSettingsModel} from '../public/shared/settings-model.js';
const scalar=(type,label,extra={})=>({type,label,unit:type,min:null,max:null,applyTo:'runtime',...extra});
const object=(fields,label='설정')=>scalar('object',label,{fields});
const schema=object({private:object({defaultPersist:scalar('boolean','기본 저장 OFF',{readOnly:true,constant:false}),anonymousDefaultTtlSeconds:scalar('integer','익명 기본 수명',{min:60,max:86400,unit:'seconds',applyTo:'new_room'})}),
 public:object({catalog:scalar('array','공개방 목록',{min:0,max:10,items:object({slug:scalar('string','경로',{min:1,max:64}),title:scalar('string','표시 제목',{min:1,max:64}),enabled:scalar('boolean','활성화')})})}),
 budget:object({workloadCaps:scalar('array','작업량 상한',{min:6,max:6,items:object({kind:scalar('enum','종류',{values:['a','b','c','d','e','f']}),unit:scalar('enum','단위',{values:['count']}),day:scalar('integer','일 상한',{min:1,max:100}),month:scalar('integer','월 상한',{min:1,max:1000})})})})});
const envelope=()=>({revision:12,schema,effects:{},settings:{private:{defaultPersist:false,anonymousDefaultTtlSeconds:3600},public:{catalog:[{slug:'fictional-room',title:'가상 방',enabled:true}]},budget:{workloadCaps:['a','b','c','d','e','f'].map(kind=>({kind,unit:'count',day:10,month:100}))}}});
it('edits typed draft fields and catalog rows while keeping baseline and counts separate',()=>{
 const original=envelope(),m=createSettingsModel(original);
 m.set('private.anonymousDefaultTtlSeconds',7200);m.addCatalog();m.set('public.catalog.1.slug','another-fictional-room');m.set('public.catalog.1.title','다른 가상 방');
 expect(m.snapshot().settings.public.catalog).toHaveLength(2);expect(original.settings.public.catalog).toHaveLength(1);
 expect(m.review().revision).toBe(12);expect(m.review().changes.some(x=>x.path==='private.anonymousDefaultTtlSeconds')).toBe(true);
 m.removeCatalog(0);expect(m.snapshot().settings.public.catalog[0].slug).toBe('another-fictional-room');m.cancel();expect(m.snapshot().settings).toEqual(original.settings);
});
it('keeps defaultPersist false and workload kind/unit immutable; validates server bounds',()=>{
 const m=createSettingsModel(envelope());
 expect(()=>m.set('private.defaultPersist',true)).toThrow('READ_ONLY_SETTING');
 expect(()=>m.set('budget.workloadCaps.0.kind','b')).toThrow('READ_ONLY_SETTING');
 expect(()=>m.set('budget.workloadCaps.0.unit','bytes')).toThrow('READ_ONLY_SETTING');
 expect(()=>m.set('private.anonymousDefaultTtlSeconds',2592000)).toThrow('SETTING_OUT_OF_RANGE');
 m.set('budget.workloadCaps.0.day',20);expect(m.snapshot().settings.budget.workloadCaps).toHaveLength(6);
 expect(()=>m.set('unknown.path',1)).toThrow('UNKNOWN_SETTING');
});
it('keeps draft on conflict and only replaces it after explicit reload confirmation',()=>{
 const m=createSettingsModel(envelope());m.set('public.catalog.0.title','가상 초안');const latest=envelope();latest.revision=13;latest.settings.public.catalog[0].title='가상 최신값';
 m.acceptLatest(latest);expect(m.snapshot().settings.public.catalog[0].title).toBe('가상 초안');
 expect(m.conflict()).toMatchObject({baseRevision:12,latestRevision:13});expect(m.conflict().changes[0]).toMatchObject({draft:'가상 초안',latest:'가상 최신값'});
 m.reloadLatest();expect(m.snapshot().revision).toBe(13);expect(m.review().changes).toHaveLength(0);
});
it('keeps local catalog row identities stable while fields and positions change',()=>{
 const m=createSettingsModel(envelope());const first=m.catalogRowIds()[0];m.addCatalog();const second=m.catalogRowIds()[1];m.set('public.catalog.0.title','새 가상 제목');
 expect(m.catalogRowIds()).toEqual([first,second]);m.removeCatalog(0);expect(m.catalogRowIds()).toEqual([second]);expect(m.snapshot().settings.public.catalog[0]).not.toHaveProperty('rowId');
});
