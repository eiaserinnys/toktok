import {renderAdminNav} from '../components/admin-nav.js';
import {renderBudgetUsage} from '../components/budget-usage.js';
import {escapeHtml as E,notice} from '../components/auth-primitives.js';
import {renderProductHeader} from '../components/header.js';
import {renderCatalog,renderCaps,renderBudget,renderPolicies} from '../components/schema-patterns.js';

// Same Common room field/card composition as the approved design. Values,
// bounds and apply timing come from the server schema, never a client seed.
const applyLabels={runtime:'실행 중 적용',new_room:'새 방에 적용',authentication:'인증에 적용',provisioning:'설치에 적용'};
const valueLabels={demo:'DEMO',hosted:'HOSTED',closed:'가입 닫힘',invite:'초대 가입',open:'이메일 가입'};
const id=path=>'setting-'+path.replaceAll('.','-');
const metadata=node=>`<small>${node.min!==null&&node.max!==null?`허용 범위 ${E(node.min)}–${E(node.max)} · `:''}${E(node.unit)}</small><span class="x-tag">${E(applyLabels[node.applyTo]||node.applyTo)}</span>`;
export function renderSettingField(node,value,path,ui={}){
 const error=ui.errors?.[path],invalid=error?` aria-invalid="true" aria-describedby="${E(id(path))}-error"`:"";
 if(Object.hasOwn(ui.raw||{},path))value=ui.raw[path];
 const disabled=node.readOnly||node.constant!==undefined;
 const attrs=`id="${E(id(path))}" data-setting="${E(path)}" ${disabled?'disabled':''} aria-label="${E(node.label)}"${invalid}`;
 let control;
 if(node.type==='boolean')control=`<label class="switch"><input type="checkbox" ${attrs} ${value?'checked':''}><span></span></label>${disabled?`<span class="x-tag">${value?'ON':'OFF'} · 읽기 전용</span>`:''}`;
 else if(node.type==='enum')control=`<select ${attrs}>${node.values.map(option=>`<option value="${E(option)}" ${value===option?'selected':''}>${E(valueLabels[option]||option)}</option>`).join('')}</select>`;
 else if(node.type==='integer')control=`<input type="number" id="${E(id(path))}" data-setting="${E(path)}" value="${E(value)}" min="${E(node.min)}" max="${E(node.max)}" step="1" ${disabled?'disabled':''} aria-label="${E(node.label)}"${invalid}>`;
 else if(node.type==='string')control=`<input type="text" ${attrs} value="${E(value)}" minlength="${E(node.min)}" maxlength="${E(node.max)}" ${node.pattern?`pattern="${E(node.pattern)}"`:''}>`;
 else return notice('편집할 수 없는 설정이에요','서버 설정 형식을 확인해주세요.','error');
 return `<div class="setting-row ${node.type==='boolean'?'toggle-row':''}"><div><label for="${E(id(path))}">${E(node.label)}</label>${metadata(node)}</div><div class="setting-control">${control}${error?`<p id="${E(id(path))}-error" class="field-error" role="alert">${E(error)}</p>`:""}</div></div>`;
}
function fields(node,value,path,model){
 if(node.type==='object')return Object.entries(node.fields).map(([key,field])=>{
  const childPath=path?path+'.'+key:key;
  if(childPath.endsWith('.policy')&&field.type==='object')return (field.recentBufferBounds?notice('최근 DB 버퍼 · 서버 고정 상한',`최대 ${field.recentBufferBounds.maxMessages}개 · ${field.recentBufferBounds.maxBytes} bytes · ${field.recentBufferBounds.maxAgeMs} ms예요. 실제 설정과 방 TTL이 더 작으면 먼저 적용해요. 장기 보관과 별개이며 백업·PITR 즉시 물리 삭제는 보장하지 않아요.`):'')+renderPolicies(model,{scopes:[path]});
  if(field.type==='object')return `<details class="settings-card"><summary>${E(field.label)} ${metadata(field)}</summary>${fields(field,value?.[key],childPath,model)}</details>`;
  if(childPath==='public.catalog'&&field.type==='array')return renderCatalog(model);
  if(childPath==='budget.workloadCaps'&&field.type==='array')return renderCaps(model);
  if(field.type==='array')return notice('편집할 수 없는 설정이에요','이 목록의 편집 구성이 아직 제공되지 않았어요.','error');
  return renderSettingField(field,value?.[key],childPath,model);
 }).join('');
 return '';
}
export function renderSettingsFields(envelope,section,ui={}){
 const node=envelope?.schema?.fields?.[section],value=envelope?.settings?.[section];
 if(!node||!value)return notice('설정을 불러올 수 없어요','서버 연결과 관리자 권한을 확인해주세요.','error');
 const model={draft:envelope.settings,schema:envelope.schema,raw:ui.raw||{},errors:ui.fieldErrors||{},rowIds:ui.catalogRowIds||envelope.settings.public?.catalog.map((_,index)=>index+1)||[]};
 if(section==='budget'&&node.fields.targetUsd&&node.fields.workloadCaps)return renderBudget(model);
 return (section==='private'?notice('새 비공개방 수명','비회원 데모 방은 24시간, 서버가 확인한 회원 방은 소유자가 닫을 때까지 유지해요. 회원 방은 데모 예산·방 개수 한도에서 제외하며 생성 속도·동시 처리·참가자·본문 보관 한도는 유지해요. 이전 TTL 값은 호환 기록이며 기존 방 수명은 바뀌지 않아요.'):'')+fields(node,value,section,model);
}
export function renderSettingsScreen(vm){
 const {status,session,resource,section='overview',changes=[],pending=false,error}=vm;
 const invalid=Object.keys(vm.fieldErrors||{}).length,dirty=changes.length||Object.keys(vm.raw||{}).length;
 const header=renderProductHeader({status,Session:session,Config:resource?{mode:resource.settings.deployment?.mode==='demo'?'DEMO':'HOSTED',signup:resource.settings.signup?.policy}:null,ui:{route:'/admin/'+section}});
 if(status!=='ready'||session?.authenticated!==true||session.role!=='admin'||!resource)return `${header}<main id="content" class="x-main x-wrap">${notice(status==='loading'?'설정을 불러오는 중이에요.':'설정을 불러올 수 없어요',status==='loading'?'관리자 권한과 서버 설정을 확인하고 있어요.':'실제 서버 세션과 관리자 권한이 필요해요. 연결 상태를 확인해주세요.',status==='loading'?'':'error')}</main>`;
 const nav=renderAdminNav(resource,section);
 let content;
 if(section==='overview'){
  const s=resource.settings;
  content=`<div class="admin-page-head"><span class="eyebrow">A CALM PLACE TO KEEP THINGS RUNNING</span><h1>공간의 약속을<br>살펴봐요.</h1></div><div class="admin-summary"><div><span>운영 방식</span><strong>${E(s.deployment?.mode)}</strong><small>${s.deployment?.enabled?'활성화':'비활성화'}</small></div><div><span>공개방</span><strong>${s.public?.catalog?.filter(row=>row.enabled).length??'확인 필요'}<small>개 활성</small></strong><small>전체 ${s.public?.catalog?.length??'확인 필요'}개</small></div><div><span>예산 목표</span><strong><small>US$</small>${E(s.budget?.targetUsd)}</strong><small>청구 상한을 보장하지 않는 모델이에요.</small></div></div>`;
 }else content=`<div class="admin-page-head"><h1>${E(resource.schema.fields[section]?.label||'설정')}</h1><p>각 항목의 단위, 허용 범위와 적용 시점을 확인해주세요.</p></div>${section==='budget'?renderBudgetUsage(vm.budget):''}${renderSettingsFields(resource,section,vm)}`;
 return `${header}<main id="content" class="admin-shell">${nav}<section class="admin-content schema-workbench">${content}<div class="save-feedback" role="status">${error?E(error.code):'변경사항을 검토한 뒤 저장해요.'}</div><div class="admin-savebar"><div><strong>${invalid?'입력값을 확인해주세요.':changes.length?'변경 '+changes.length+'개':'저장 전 변경사항이 없어요.'}</strong><span>설정 버전 <b>${E(resource.revision)}</b></span></div><div><button type="button" class="btn soft" data-x="cancel-settings" ${pending||!dirty?'disabled':''}>취소</button><button type="button" class="btn primary" data-x="review-settings" ${pending||!changes.length||invalid?'disabled':''}>변경 검토</button></div></div></section></main>`;
}
