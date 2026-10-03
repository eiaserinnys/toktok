import {configFixture,anonymousFixture} from './auth-settings-fixtures.js';
import {accountSessionFixture,agentFixture} from './account-fixtures.js';
const id='00000000-0000-4000-8000-000000000001';
export const claimFixtures={components:[],dialogs:[],
 screens:[...['claim-email','claim-verify','claim-otp-error'].map(state=>({fixtureId:state,title:'에이전트 계정 확인 · '+state,screenId:'auth',state,routeId:'claim',path:'/claim/'+id+'/'+'f'.repeat(43),audiences:['guest'],args:[{screen:state==='claim-email'?'login':'verify',status:'ready',Config:configFixture,Session:anonymousFixture,ui:{purpose:'claim',cancelReturn:'/rooms',email:'fictional@example.com',challenge:{flow:'fictional-flow',nonce:'fictional-nonce',expires_at:'2026-10-04T00:00:00.000Z'},otpError:state==='claim-otp-error'?'OTP_INVALID':null}}]})),...['anonymous','unchecked','checked','pending','approved','error','expired','loading','unavailable'].map(state=>({fixtureId:'claim-'+state,title:'소유자 확인 · '+state,screenId:'claim',state,routeId:'claim',path:'/claim/'+id+'/'+'f'.repeat(43),audiences:['member','guest'],args:[{status:['expired','loading','unavailable'].includes(state)?state==='loading'?'loading':'unavailable':'ready',Config:configFixture,Session:state==='anonymous'?anonymousFixture:accountSessionFixture,agent:{...agentFixture,id,status:state==='approved'?'approved':'pending',credential_expires_at:state==='approved'?agentFixture.credential_expires_at:null},checked:['checked','pending'].includes(state),pending:state==='pending',error:['error','expired'].includes(state)?{code:state==='expired'?'CLAIM_GONE':'ADMISSION_DENIED'}:null}]}))],
 transitions:[{transitionId:'claim-approved',from:'claim-checked',to:'claim-approved'},
 {transitionId:'claim-denied',from:'claim-checked',to:'claim-error'},
 {transitionId:'claim-expired',from:'claim-unchecked',to:'claim-expired'},
 {transitionId:'claim-email',from:'claim-anonymous',to:'claim-email'},
 {transitionId:'claim-otp',from:'claim-email',to:'claim-verify'},
 {transitionId:'claim-session-verified',from:'claim-verify',to:'claim-unchecked'},
 {transitionId:'claim-otp-denied',from:'claim-verify',to:'claim-otp-error'},
 {transitionId:'claim-logout',from:'claim-unchecked',to:'rooms-default'},
 {transitionId:'claim-back',from:'claim-unchecked',to:'rooms-default'}]};
