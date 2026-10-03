import {fail} from './http';
const trustedAddresses=new WeakMap<Request,string>();
/** Called only by the Node socket/proxy boundary, never from serialized request input. */
export function bindTrustedAddress(request:Request,address:string):Request {trustedAddresses.set(request,address);return request;}
export function socketAddress(request:Request):string {
 const address=trustedAddresses.get(request);
 if(!address)fail(503,'TRUSTED_IP_REQUIRED','신뢰된 요청 경계가 필요합니다.');
 return address;
}
