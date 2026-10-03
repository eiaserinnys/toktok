import {DurableObject} from 'cloudflare:workers';
import {PublicRoomCore} from './public-core';
import {PUBLIC_POLICY,PUBLIC_CATALOG,type PublicEnv,type PublicPolicy,type ValidatedOperatorAck} from './public-contracts';
/** CF actor wrapper: all public body/lease/cursor state lives only inside the shared RAM core. */
export class PublicRoom extends DurableObject<PublicEnv> {
  readonly core:PublicRoomCore;
  constructor(ctx:DurableObjectState,env:PublicEnv,dependencies?:{budgetFactory:(env:PublicEnv)=>import('./private-contracts').PrivateBudgetPort}){super(ctx,env);this.core=new PublicRoomCore({origin:env.PUBLIC_ORIGIN,budget:dependencies?.budgetFactory(env),catalog:()=>PUBLIC_CATALOG,policy:()=>({...PUBLIC_POLICY})});}
  fetch(request:Request){return this.core.fetch(request);}
  issueOperatorGrant(ack:ValidatedOperatorAck){return this.core.issueOperatorGrant(ack);}
  connectionApproval(input:import('./public-connections').ConnectionApprovalInput,ip:string,room:string){return this.core.connectionApproval(input,ip,room);}
  diagnostics(){return this.core.diagnostics();}
  configure(revision:number,policy:PublicPolicy,catalog:ReadonlyArray<{slug:string;title:string}>){this.core.configure(revision,policy,catalog);}
  shutdown(){this.core.shutdown();}
}
