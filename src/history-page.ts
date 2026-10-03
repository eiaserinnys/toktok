import {bad,fail} from './http';
export interface HistoryMessage {sequence:number;cursor:string;created_at:string;}
export function historyCursor(value:string|undefined,epoch:string,last:number){
 if(value===undefined)return {sequence:last,status:'ok' as const};
 const m=/^([a-f0-9-]{36}):(0|[1-9][0-9]*)$/.exec(value);if(!m||!Number.isSafeInteger(Number(m[2])))bad();
 if(m[1]!==epoch)return {sequence:Number(m[2]),status:'history_reset' as const};
 if(Number(m[2])>last)bad();return {sequence:Number(m[2]),status:'ok' as const};
}
export function historyRange(epoch:string,last:number,first:number,after:string|undefined,before:string|undefined,limit:number,initial:number){
 if(after!==undefined&&before!==undefined)bad();
 const parsed=historyCursor(after??before,epoch,last);
 const status:'ok'|'history_gap'|'history_reset'=parsed.status==='history_reset'?'history_reset':(after!==undefined&&parsed.sequence<first-1||before!==undefined&&parsed.sequence<first)?'history_gap':'ok';
 const reset=status!=='ok',latest=reset||(after===undefined&&before===undefined),backward=latest||before!==undefined;
 const count=latest?Math.min(limit,initial):limit;
 const end=latest?last:before!==undefined?parsed.sequence-1:Math.min(last,parsed.sequence+count);
 const start=backward?Math.max(first,end-count+1):Math.max(first,parsed.sequence+1);
 return {status,latest,backward,start,end,count};
}
export function historyPage<T extends HistoryMessage>(rows:T[],epoch:string,last:number,first:number,after:string|undefined,before:string|undefined,limit:number,initial:number){
 const range=historyRange(epoch,last,first,after,before,limit,initial);
 const messages=rows.filter(m=>m.sequence>=range.start&&m.sequence<=range.end);
 const page={messages,epoch,cursor:messages.at(-1)?.cursor??(range.latest?epoch+':'+last:after??before??epoch+':'+last),latest_cursor:epoch+':'+last,before_cursor:messages[0]?.cursor??(range.latest?epoch+':'+first:before??epoch+':'+first),earliest_cursor:epoch+':'+(first-1),history_status:range.status,has_more:!range.backward&&(messages.at(-1)?.sequence??range.start-1)<last,has_older:(messages[0]?.sequence??range.start)>first,
 ...(range.latest?{initial_window:{max_messages:initial,truncated:range.start>first}}:{})};
 return page;
}
export function boundHistoryPage<T extends {messages:HistoryMessage[];epoch:string;cursor:string;before_cursor:string;earliest_cursor:string;has_more:boolean;has_older:boolean;initial_window?:{truncated:boolean}}>(page:T,bytes:number,backward:boolean){
 let raw=JSON.stringify(page);while(new TextEncoder().encode(raw).length>bytes&&page.messages.length>1){if(backward){page.messages.shift();page.has_older=true;if(page.initial_window)page.initial_window.truncated=true;}else{page.messages.pop();page.has_more=true;}page.cursor=page.messages.at(-1)!.cursor;page.before_cursor=page.messages[0].cursor;raw=JSON.stringify(page);}
 if(new TextEncoder().encode(raw).length>bytes)fail(503,'POLICY_BOUNDS','메시지 응답이 허용 크기에 들어가지 않습니다.');return raw;
}
export function historyQuery(url:URL,wait:boolean){
 for(const key of ['after','before','limit','timeout'])if(url.searchParams.getAll(key).length>1)bad();
 const after=url.searchParams.get('after')??undefined,before=url.searchParams.get('before')??undefined;
 if(before!==undefined&&(after!==undefined||wait))bad();return {after,before};
}
