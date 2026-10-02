import type { PublicEnv, ValidatedOperatorAck } from '../src/public-contracts';
import { PUBLIC_CATALOG, PUBLIC_NOTICE, INTERNAL_IP_HEADER } from '../src/public-contracts';
import { handlePublicRequest,publicError } from '../src/public-http';
import { hash, json } from '../src/http';
export { PublicRoom } from '../src/public-room';
// Fixture-only transport. It is never exported by src/index.ts or bound by production Wrangler.
export default {async fetch(request:Request,env:PublicEnv):Promise<Response> {
  try {
    const path=new URL(request.url).pathname;
    const slug=path.split('/').at(-1)!;
    const ip=request.headers.get('x-fixture-ip')??'192.0.2.1';
    if(path.startsWith('/__fixture/')&&PUBLIC_CATALOG.some(r=>r.slug===slug)) {
      const stub=env.PUBLIC_ROOMS.getByName(slug);
      if(path.startsWith('/__fixture/grants/')) {
        const ack={room:slug,risk_ack_version:PUBLIC_NOTICE,checked:true,trustedIpHash:await hash(ip)} as ValidatedOperatorAck;
        const result=await stub.issueOperatorGrant(ack),response=json(result.data,result.status);
        if(result.retry_after_ms!==undefined)response.headers.set('Retry-After',String(Math.ceil(result.retry_after_ms/1000)));
        return response;
      }
      if(path.startsWith('/__fixture/diagnostics/'))return json(await stub.diagnostics());
    }
    const headers=new Headers(request.headers);
    headers.delete(INTERNAL_IP_HEADER);headers.set('CF-Connecting-IP',ip);
    return await handlePublicRequest(new Request(request,{headers}),env)??new Response(null,{status:404});
  }catch(error){return publicError(error);}
}} satisfies ExportedHandler<PublicEnv>;
