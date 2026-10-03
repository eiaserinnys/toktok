import {bad,fail} from './http';
import {serviceMetadata} from './public-safety';
import type {PrivateMessage,PrivatePolicy} from './private-contracts';
export function parsePrivateCursor(after:string|undefined,epoch:string,last:number):{sequence:number;status:'ok'|'history_reset'} {
 if(after===undefined)return {sequence:last,status:'ok'};const m=/^([a-f0-9-]{36}):(0|[1-9][0-9]*)$/.exec(after);if(!m||!Number.isSafeInteger(Number(m[2])))bad();if(m[1]!==epoch)return {sequence:Number(m[2]),status:'history_reset'};if(Number(m[2])>last)bad();return {sequence:Number(m[2]),status:'ok'};
}
export function privatePage(rows:PrivateMessage[],epoch:string,last:number,first:number,after:string|undefined,limit:number,policy:PrivatePolicy,now:number,roomStatus:string,noticeContext:object={}){
 const cursor=parsePrivateCursor(after,epoch,last);const status=cursor.status==='history_reset'?'history_reset':after!==undefined&&cursor.sequence<first-1?'history_gap':'ok';const initial=after===undefined||status!=='ok';
 const selected=initial?rows.filter(m=>now-Date.parse(m.created_at)<=policy.firstWindowMs).slice(-policy.firstWindowMessages):rows.filter(m=>m.sequence>cursor.sequence);
 const messages=selected.slice(0,limit),fallback=initial?(selected[0]?epoch+':'+(selected[0].sequence-1):epoch+':'+last):after!;
 const page={...noticeContext,service:serviceMetadata(['messages[].sender.nickname','messages[].text']),messages,epoch,cursor:messages.at(-1)?.cursor??fallback,earliest_cursor:epoch+':'+(first-1),history_status:status,has_more:selected.length>messages.length,room_status:roomStatus,
 ...(initial?{initial_window:{max_age_seconds:policy.firstWindowMs/1000,max_messages:policy.firstWindowMessages,truncated:last>selected.length}}:{}),...(status!=='ok'?{notice:status==='history_reset'?'방의 메모리 epoch가 변경되었습니다.':'요청 cursor 앞부분이 보관 범위에서 삭제되었습니다.'}:{})};
 let raw=JSON.stringify(page);while(new TextEncoder().encode(raw).length>policy.responseBytes&&page.messages.length){page.messages.pop();page.has_more=true;page.cursor=page.messages.at(-1)?.cursor??fallback;raw=JSON.stringify(page);}
 if(new TextEncoder().encode(raw).length>policy.responseBytes||(page.has_more&&!page.messages.length))fail(503,'POLICY_BOUNDS','메시지 응답이 허용 크기에 들어가지 않습니다.');return page;
}
