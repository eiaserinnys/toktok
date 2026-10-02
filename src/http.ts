export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string,public retryAfter?:number) {super(message);}
}
export function fail(status: number, code: string, message: string): never {throw new HttpError(status,code,message);}
export function bad(): never {return fail(400,'INVALID_INPUT','입력 형식이나 범위가 올바르지 않습니다.');}
export const limited = () => fail(429,'RATE_LIMITED','요청 한도를 초과했습니다.');
export function json(data: unknown, status=200): Response {return Response.json(data,{status});}
export function errorResponse(error: unknown): Response {
  const e = error instanceof HttpError ? error : new HttpError(500,'INTERNAL_ERROR','요청을 처리하지 못했습니다.');
  const r=json({error:{code:e.code,message:e.message}},e.status);
  if(e.retryAfter||e.status===429) r.headers.set('Retry-After',String(e.retryAfter??60));
  return r;
}
export function secure(response: Response): Response {
  const result=new Response(response.body,response);
  for(const [key,value] of Object.entries({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; frame-ancestors 'none'; base-uri 'none'"})) result.headers.set(key,value);
  return result;
}
export function bearer(request: Request): string {
  const match=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization') ?? '');
  if(!match) fail(401,'AUTH_REQUIRED','Bearer 인증정보가 필요합니다.');
  return match[1];
}
export async function hash(token: string): Promise<string> {
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export function newToken(): string {return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export async function body(request: Request, allowed: string[]): Promise<Record<string,unknown>> {
  if(!request.headers.get('Content-Type')?.split(';')[0].trim().match(/^application\/json$/i)) bad();
  if(Number(request.headers.get('Content-Length'))>32768) fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 32KiB입니다.');
  const reader=request.body?.getReader();
  if(!reader) bad();
  let size=0; const chunks:Uint8Array[]=[];
  try {
    for(;;) {
      const {done,value}=await reader.read(); if(done) break;
      size+=value.byteLength;
      if(size>32768) {await reader.cancel(); fail(413,'BODY_TOO_LARGE','JSON 요청은 최대 32KiB입니다.');}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size); let offset=0;
  for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  let data: unknown;
  try {data=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));} catch {bad();}
  if(!data || typeof data!=='object' || Array.isArray(data)) bad();
  const record=data as Record<string,unknown>;
  if(Object.keys(record).some(key=>!allowed.includes(key))) bad();
  return record;
}
export function text(value: unknown, min: number, max: number): string {
  if(typeof value!=='string'||Array.from(value).length<min||Array.from(value).length>max) bad();
  return value;
}
export function integer(value: unknown, min: number, max: number): number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max) bad(); return value;
}
export function queryInt(url: URL, key: string, fallback: number, min: number, max: number): number {
  const values=url.searchParams.getAll(key); if(values.length===0) return fallback;
  if(values.length!==1||!/^\d+$/.test(values[0])) bad();
  return integer(Number(values[0]),min,max);
}
export function publicOrigin(value: string): string {
  let url:URL; try {url=new URL(value);} catch {return fail(503,'CONFIGURATION_ERROR','공개 origin 설정이 필요합니다.');}
  if(url.origin!==value || (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) fail(503,'CONFIGURATION_ERROR','공개 origin 설정이 올바르지 않습니다.');
  return value;
}
