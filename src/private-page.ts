import {historyCursor,historyPage,boundHistoryPage} from './history-page';
import {serviceMetadata} from './public-safety';
import type {PrivateMessage,PrivatePolicy} from './private-contracts';
export const parsePrivateCursor=historyCursor;
export function privatePage(rows:PrivateMessage[],epoch:string,last:number,first:number,after:string|undefined,limit:number,policy:PrivatePolicy,now:number,roomStatus:string,noticeContext:object={},before?:string){
 const page={...noticeContext,service:serviceMetadata(['messages[].sender.nickname','messages[].text']),...historyPage(rows,epoch,last,first,after,before,limit,policy.firstWindowMessages),room_status:roomStatus};
 boundHistoryPage(page,policy.responseBytes,after===undefined||page.history_status!=='ok');return page;
}
