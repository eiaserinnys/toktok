import {it,expect} from 'vitest';
import {handleAdminDesign} from '../src/admin-design-route';

const paths=['/admin/design/components','/admin/design/dialogues','/admin/design/flows',
 '/api/admin/design/catalog','/api/admin/design/graph','/admin/design/_assets/controller.js'];
const request=(path:string,method='GET')=>new Request('https://toktok.example'+path,{method});

it('keeps every QA document, API and asset closed before server authorization is wired',async()=>{
 let served=0;
 for(const path of paths){
  const response=await handleAdminDesign(request(path+'?role=admin&fixtureRole=admin'),{
   handle:async()=>{served++;return new Response('private fixture');}
  });
  expect(response?.status).toBe(503);
  expect(await response!.text()).not.toContain('private fixture');
 }
 expect(served).toBe(0);
});

it('uses only the server callback and never serves denied HTML, API or assets',async()=>{
 let served=0;
 for(const path of paths)for(const status of [401,403] as const){
  const response=await handleAdminDesign(request(path+'?role=admin'),{
   authorizeAdmin:async()=>({authorized:false,status}),
   handle:async()=>{served++;return new Response('private fixture');}
  });
  expect(response?.status).toBe(status);
  expect(await response!.text()).not.toContain('private fixture');
  expect(response!.headers.get('Cache-Control')).toBe('no-store');
  expect(response!.headers.get('X-Robots-Tag')).toContain('noindex');
 }
 expect(served).toBe(0);
});

it('does not turn an authorization failure into a successful fixture response',async()=>{
 let served=0;
 const response=await handleAdminDesign(request(paths[0]),{
  authorizeAdmin:async()=>{throw new Error('unavailable');},
  handle:async()=>{served++;return new Response('private fixture');}
 });
 expect(response?.status).toBe(503);expect(served).toBe(0);
});

it('serves authorized routes with network/form isolation and no caching',async()=>{
 let served=0;
 for(const path of paths){
  const response=await handleAdminDesign(request(path),{
   authorizeAdmin:async()=>({authorized:true}),
   handle:async()=>{served++;return new Response('fictional fixture',{headers:{'Cache-Control':'public','Content-Security-Policy':"connect-src *"}});}
  });
  expect(response?.status).toBe(200);
  expect(await response!.text()).toBe('fictional fixture');
  expect(response!.headers.get('Cache-Control')).toBe('no-store');
  expect(response!.headers.get('X-Robots-Tag')).toContain('noindex');
  expect(response!.headers.get('Content-Security-Policy')).toContain("connect-src 'none'");
  expect(response!.headers.get('Content-Security-Policy')).toContain("form-action 'none'");
 }
 expect(served).toBe(paths.length);
});

it('claims unknown QA paths without public Assets fallback and prevents QA mutations',async()=>{
 let served=0;
 const ports={authorizeAdmin:async()=>({authorized:true as const}),handle:async()=>{served++;return null;}};
 expect((await handleAdminDesign(request('/admin/design/unknown'),ports))?.status).toBe(404);
 expect((await handleAdminDesign(request(paths[0],'POST'),ports))?.status).toBe(405);
 expect(served).toBe(1);
 for(const path of ['/','/public/common-room','/admin/design-other','/api/admin/settings'])
  expect(await handleAdminDesign(request(path),ports)).toBeNull();
});

it('keeps HEAD authorized and bodyless',async()=>{
 const response=await handleAdminDesign(request(paths[0],'HEAD'),{
  authorizeAdmin:async()=>({authorized:true}),handle:async()=>new Response('fictional fixture')
 });
 expect(response?.status).toBe(200);expect(await response!.text()).toBe('');
});
