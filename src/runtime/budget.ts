import type {PrivateBudgetPort,PrivateBudgetKind} from '../private-contracts';
import {fail} from '../http';
export type ReservationContext=Readonly<Record<Exclude<PrivateBudgetKind,'active_room_seconds'>,string>>;
/** Per-instance RAM funding. No timer, persisted grant, or actual billing claim. */
export class CoreBudget {
 private fundedUntil=0;private funding?:Promise<void>;
 constructor(private readonly port:PrivateBudgetPort|undefined,private readonly clock:()=>number){}
 private required():PrivateBudgetPort {if(!this.port)fail(503,'BUDGET_UNAVAILABLE','예산 예약 서비스가 준비되지 않았습니다.');return this.port;}
 async fund():Promise<void>{if(this.fundedUntil>=this.clock()+30000)return;if(!this.funding){this.funding=(async()=>{const port=this.required();await port.reserve(port.newOperationId(),'active_room_seconds',60);this.fundedUntil=Math.max(this.clock(),this.fundedUntil)+60000;})().finally(()=>{this.funding=undefined;});}await this.funding;}
 async admit():Promise<ReservationContext>{await this.fund();const port=this.required(),context:ReservationContext={admission_requests:port.newOperationId(),response_bytes:port.newOperationId(),persistent_write_bytes:port.newOperationId()};await this.reserve(context,'admission_requests',1);return context;}
 async reserve(context:ReservationContext,kind:Exclude<PrivateBudgetKind,'active_room_seconds'>,amount:number):Promise<void>{if(kind==='response_bytes'&&amount===0)return;await this.required().reserve(context[kind],kind,amount);}
 async respond(response:Response,operation:ReservationContext):Promise<Response>{const bytes=await response.arrayBuffer();await this.reserve(operation,'response_bytes',bytes.byteLength);return new Response(response.status===204?null:bytes,response);}
 diagnostics(){return {funded_until:this.fundedUntil,funding_pending:!!this.funding};}
}
