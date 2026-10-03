// Reference renderer for porting into the existing shared product components.
export const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function disclosure({id,title,body,version,open=false}) {
 if(!/^[a-z][a-z0-9-]*$/.test(id))throw Error('INVALID_NOTICE_ID');
 return `<details id="${id}" class="notice"${open?' open':''}${version?` data-notice-version="${escapeHtml(version)}"`:''}><summary>${escapeHtml(title)}</summary><div>${escapeHtml(body)}</div></details>`;
}
export function policySummary(room){
 if(!room||!['recent_buffer','persisted','memory'].includes(room.retention_mode))return {ready:false,text:'보관 조건을 확인할 수 없어요. 다시 확인해주세요.'};
 if(room.retention_mode==='memory')return {ready:true,text:'이전 정책 · 본문 메모리 보관 · 재시작 시 사라질 수 있어요.'};
 if(!Number.isSafeInteger(room.retention_seconds)||room.retention_seconds<=0)return {ready:false,text:'보관 조건을 확인할 수 없어요. 다시 확인해주세요.'};
 const s=room.retention_seconds,d=s%86400===0?s/86400+'일':s%3600===0?s/3600+'시간':s%60===0?s/60+'분':s+'초';
 if(room.retention_mode==='persisted')return {ready:true,text:`선택한 본문 보관 · 최대 ${d} · 방 만료가 먼저 오면 읽을 수 없어요.`};
 const b=room.recent_buffer;
 if(!b||!Number.isSafeInteger(b.max_messages)||b.max_messages<1||b.max_messages>500||b.max_bytes!==2097152||s>3600)return {ready:false,text:'보관 조건을 확인할 수 없어요. 다시 확인해주세요.'};
 return {ready:true,text:`최근 대화 · 최대 ${b.max_messages}개·2MiB·${d} 중 먼저 도달한 한도. 더 짧은 서버 설정·방 만료가 우선해요.`};
}
export function lifetimeSummary(room){
 if(room?.lifetime==='member_permanent'&&room.expires_at===null)return '소유자가 닫을 때까지 · 대화 보관 기간은 별도';
 if(room?.lifetime==='demo_24h')return '생성 후 24시간 · 대화 보관 기간은 별도';
 return room?.expires_at?'방 만료 '+String(room.expires_at):'방 수명을 확인할 수 없어요.';
}

