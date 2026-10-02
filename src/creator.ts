import { bearer, fail, hash } from './http';
interface Credential { creator_id: string; token_sha256: string; enabled: boolean; }
export async function authenticateCreator(request: Request, registry: string): Promise<string> {
  let records: unknown;
  try {records=JSON.parse(registry);} catch {unconfigured();}
  if(!Array.isArray(records)||records.length===0 || records.some(r=>!r||typeof r.creator_id!=='string'||!r.creator_id||typeof r.enabled!=='boolean'||typeof r.token_sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.token_sha256))) unconfigured();
  const credentials=records as Credential[];
  if(!credentials.some(r=>r.enabled)||new Set(credentials.map(r=>r.token_sha256)).size!==credentials.length) unconfigured();
  const fingerprint=await hash(bearer(request));
  const credential=credentials.find(r=>r.enabled && r.token_sha256===fingerprint);
  if(!credential) fail(401,'INVALID_CREDENTIAL','생성자 인증정보가 올바르지 않습니다.');
  return credential.creator_id;
}
function unconfigured(): never {return fail(503,'CREATOR_AUTH_UNCONFIGURED','승인된 방 생성자 인증이 아직 설정되지 않았습니다.');}
