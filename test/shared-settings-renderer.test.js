import {it,expect} from 'vitest';
import {renderSettingsFields} from '../public/shared/screens/settings.js';
const node=(type,label,extra={})=>({type,label,unit:type,min:null,max:null,applyTo:'runtime',...extra});
const object=(fields,label='설정')=>node('object',label,{fields});
const integer=(label,min,max,unit)=>node('integer',label,{min,max,unit});
const kinds=['admission_requests','response_bytes','private_creates','active_room_seconds','persistent_write_bytes','email_attempts'];
const envelope=()=>({revision:27,settings:{
 public:{catalog:[{slug:'fictional-room',title:'<가상 방>',enabled:true}],policy:{batchMs:4000}},
 private:{defaultPersist:false,anonymousDefaultTtlSeconds:3600,authenticatedDefaultTtlSeconds:86400},
 budget:{targetUsd:25,warningUsd:12,cutoffUsd:18,workloadCaps:kinds.map((kind,i)=>({kind,unit:i===1||i===4?'bytes':i===3?'seconds':'count',day:10,month:100}))}},
 schema:object({public:object({catalog:node('array','공개방 목록',{min:0,max:10,items:object({slug:node('string','경로',{min:1,max:64}),title:node('string','표시 제목',{min:1,max:64}),enabled:node('boolean','활성화')})}),policy:object({batchMs:integer('응답 묶음 간격',2000,10000,'ms')},'공개방 정책')}),
 private:object({defaultPersist:node('boolean','기본 저장 OFF',{constant:false,readOnly:true,applyTo:'new_room'}),anonymousDefaultTtlSeconds:integer('익명 기본 수명',60,86400,'seconds'),authenticatedDefaultTtlSeconds:integer('계정 기본 수명',60,604800,'seconds')}),
 budget:object({targetUsd:integer('목표',1,10000,'USD'),warningUsd:integer('경고',1,10000,'USD'),cutoffUsd:integer('차단',1,10000,'USD'),workloadCaps:node('array','작업량 상한',{min:6,max:6,boundsByKind:Object.fromEntries(kinds.map((kind,i)=>[kind,{unit:i===1||i===4?'bytes':i===3?'seconds':'count',dayMax:1000+i,monthMax:10000+i}])),items:object({kind:node('enum','종류',{values:kinds}),unit:node('enum','단위',{values:['count','bytes','seconds']}),day:integer('일 상한',1,1000,'units'),month:integer('월 상한',1,10000,'units')})})})})});
it('renders stacked catalog rows with schema max and derived enabled/total counts, including empty',()=>{
 const e=envelope(),html=renderSettingsFields(e,'public');
 expect(html).toContain('활성 1개 / 전체 1개');expect(html).toContain('/public/fictional-room');expect(html).toContain('&lt;가상 방&gt;');expect(html).not.toContain('<가상 방>');
 expect(html).toContain('data-schema-field="public.catalog.0.title"');expect(html).toContain('data-schema-action="add-room"');expect(html).toContain('최대 10개');expect(html).toContain('data-schema-action="remove-room"');
 e.settings.public.catalog=[];expect(renderSettingsFields(e,'public')).toContain('등록한 공개방이 없어요');
 e.settings.public.catalog=Array.from({length:10},(_,i)=>({slug:'fictional-'+i,title:'가상',enabled:false}));
 expect(renderSettingsFields(e,'public')).toMatch(/data-schema-action="add-room"[^>]*disabled/);
});
it('renders exactly six immutable kind/unit cards with day/month fields and DTO dollars',()=>{
 const html=renderSettingsFields(envelope(),'budget');
 expect((html.match(/class="schema-cap-card"/g)||[])).toHaveLength(6);
 expect(html).toContain('입장 요청');expect(html).toContain('응답 전송량');expect(html).not.toContain('data-schema-field="budget.workloadCaps.0.kind"');
 expect(html).not.toContain('data-setting="budget.workloadCaps.0.kind"');expect(html).not.toContain('data-x="workload-add"');
 expect(html).toMatch(/data-schema-field="budget.warningUsd"[^>]*value="12"/);expect(html).toMatch(/data-schema-field="budget.cutoffUsd"[^>]*value="18"/);
 expect(html).toContain('USD');expect(html).not.toContain('80%');expect(html).toContain('청구액을 보장하는');
 expect(html).not.toContain('<textarea');
 expect(html).toMatch(/data-schema-field="budget.workloadCaps.1.day"[^>]*max="1001"/);
 expect(html).toMatch(/data-schema-field="budget.workloadCaps.1.month"[^>]*max="10001"/);
 expect(html).toContain('value="10"');expect(html).toContain('value="25"');
});
it('keeps nested sections ordinary and exposes schema bounds/unit/applyTo with default OFF read-only',()=>{
 const html=renderSettingsFields(envelope(),'public');
 expect(html).toContain('<details');expect(html).toContain('응답 묶음 간격');expect(html).toContain('2,000–10,000');expect(html).toContain('ms');expect(html).toContain('실행 중 적용');
 const privateHtml=renderSettingsFields(envelope(),'private');
 expect(privateHtml).toMatch(/data-setting="private.defaultPersist"[^>]*disabled/);expect(privateHtml).toContain('OFF');
 expect(privateHtml).toContain('익명 기본 수명');expect(privateHtml).toContain('계정 기본 수명');
 expect(renderSettingsFields(null,'public')).toContain('설정을 불러올 수 없어요');
});

it('keeps catalog field identity across array index changes and refuses missing per-kind bounds',()=>{
 const e=envelope();e.settings.public.catalog.push({slug:'second',title:'두 번째',enabled:false});
 const first=renderSettingsFields(e,'public',{catalogRowIds:[41,42]});
 expect(first).toContain('id="schema-catalog-42-title"');expect(first).not.toContain('undefined');
 e.settings.public.catalog.shift();expect(renderSettingsFields(e,'public',{catalogRowIds:[42]})).toContain('id="schema-catalog-42-title"');
 delete e.schema.fields.budget.fields.workloadCaps.boundsByKind.response_bytes;
 const missing=renderSettingsFields(e,'budget');expect(missing).toContain('최신 설정을 다시 불러와주세요');
 expect(missing).not.toContain('data-schema-field="budget.workloadCaps.1.day"');
});

it('shows invalid ordinary TTL input and an associated error instead of the last valid value',()=>{
 const html=renderSettingsFields(envelope(),'private',{raw:{'private.anonymousDefaultTtlSeconds':'0'},fieldErrors:{'private.anonymousDefaultTtlSeconds':'허용 범위를 확인해주세요.'}});
 expect(html).toMatch(/data-setting="private.anonymousDefaultTtlSeconds"[^>]*value="0"[^>]*aria-invalid="true"/);
 expect(html).toContain('id="setting-private-anonymousDefaultTtlSeconds-error"');expect(html).toContain('허용 범위를 확인해주세요.');
});

it('renders policy integer inputs with native numeric min and max attributes',()=>{
 const html=renderSettingsFields(envelope(),'public');expect(html).toMatch(/data-schema-field="public.policy.batchMs" type="number"[^>]*min="2000" max="10000"/);expect(html).not.toContain('type="integer"');
});
