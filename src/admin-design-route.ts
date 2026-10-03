/** Root must supply real session + DB-role authorization before wiring this route. */
export type AdminAuthorization={authorized:true}|{authorized:false;status:401|403};
export interface AdminDesignPorts {
 authorizeAdmin?:(request:Request)=>Promise<AdminAuthorization>;
 handle:(request:Request)=>Promise<Response|null>;
}

const qaCsp="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";
function protect(response:Response,head=false):Response {
 const result=new Response(head?null:response.body,response);
 result.headers.set('Cache-Control','no-store');
 result.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
 result.headers.set('Referrer-Policy','no-referrer');
 result.headers.set('X-Content-Type-Options','nosniff');
 result.headers.set('Content-Security-Policy',qaCsp);
 return result;
}
const error=(status:number,code:string)=>Response.json({error:{code}}, {status});

/** null means unrelated route; every protected-prefix result forbids Assets fallback. */
export async function handleAdminDesign(request:Request,ports:AdminDesignPorts):Promise<Response|null> {
 const path=new URL(request.url).pathname;
 if(!['/admin/design','/api/admin/design'].some(prefix=>path===prefix||path.startsWith(prefix+'/')))return null;
 const head=request.method==='HEAD';
 if(!ports.authorizeAdmin)return protect(error(503,'ADMIN_AUTH_UNAVAILABLE'),head);
 let authorization:AdminAuthorization;
 try{authorization=await ports.authorizeAdmin(request);}
 catch{return protect(error(503,'ADMIN_AUTH_UNAVAILABLE'),head);}
 if(!authorization.authorized)return protect(error(authorization.status,authorization.status===401?'AUTH_REQUIRED':'ADMIN_REQUIRED'),head);
 if(!['GET','HEAD'].includes(request.method)){
  const response=error(405,'METHOD_NOT_ALLOWED');response.headers.set('Allow','GET, HEAD');
  return protect(response,head);
 }
 return protect(await ports.handle(request)??error(404,'NOT_FOUND'),head);
}
