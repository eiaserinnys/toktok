export interface ConnectionApprovalInput {
 action:'preview'|'approve'|'deny'|'revoke'; request_id:string;
 proof?:string; nonce?:string; checked?:boolean; risk_ack_version?:string; entry_notice_version?:string;
}
export interface ConnectionApprovalResult {
 status:number; data:Record<string,unknown>; cookie?:string;
}
