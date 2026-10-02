import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const contentTypes:Record<string,string>={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
/** Static public assets only. No SPA fallback into /admin or other authenticated routes. */
export async function staticAsset(request:Request,root:string):Promise<Response|null>{
  const url=new URL(request.url);if(request.method!=='GET'||!url.pathname.startsWith('/assets/'))return null;
  try{const base=await realpath(root),path=await realpath(resolve(base,'.'+decodeURIComponent(url.pathname)));if(!path.startsWith(base+sep)||!contentTypes[extname(path)])return new Response(null,{status:404});return new Response(new Uint8Array(await readFile(path)),{headers:{'Content-Type':contentTypes[extname(path)],'X-Content-Type-Options':'nosniff'}});}catch{return new Response(null,{status:404});}
}
