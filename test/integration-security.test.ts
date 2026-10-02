import {expect, it} from 'vitest';
import {secure} from '../src/http';
import {DESIGN_REVIEW_CSP, secureRouteResponse} from '../src/response-security';
import {designSurface, isPublicAsset} from '../src/site-assets';

const request = (path: string, method = 'GET') => new Request('https://toktok.example' + path, {method, headers: {'X-Response-Policy': 'product'}});

it('keeps the final QA policy after legacy security and Assets headers, for success and error', async () => {
  for (const status of [200, 401, 403, 404, 503]) for (const path of ['/admin/design/flows', '/admin/design/_assets/shared/registry.js', '/api/admin/design/graph']) {
    const r = secureRouteResponse(request(path), secure(new Response('fixture', {status, headers: {'Content-Security-Policy': "connect-src *", 'Cache-Control': 'public'}})));
    expect(r.status).toBe(status);
    expect(r.headers.get('Content-Security-Policy')).toBe(DESIGN_REVIEW_CSP);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Robots-Tag')).toContain('noindex');
  }
  expect(secureRouteResponse(request('/public/common-room?fixtureRole=admin'), new Response()).headers.get('Content-Security-Policy')).not.toContain("connect-src 'none'");
});

it('authorizes each protected document and mirror before Assets access and blocks bypass paths', async () => {
  const seen: string[] = [];
  const assets = {fetch: async (r: Request) => {seen.push(new URL(r.url).pathname); return new Response('fixture');}};
  for (const path of ['/admin/design/components', '/admin/design/_assets/admin-design/controller.js', '/admin/design/_assets/shared/registry.js', '/api/admin/design/graph']) {
    const r = await designSurface(request(path + '?fixtureRole=admin'), {assets, authorizeAdmin: async () => ({authorized: false, status: 401})});
    expect(r?.status).toBe(401);
  }
  expect(seen).toEqual([]);
  const allowed = {assets, authorizeAdmin: async () => ({authorized: true as const})};
  expect((await designSurface(request('/admin/design/flows'), allowed))?.status).toBe(200);
  expect((await designSurface(request('/admin/design/_assets/shared/registry.js'), allowed))?.status).toBe(200);
  expect(seen).toEqual(['/admin-design/index.html', '/shared/registry.js']);
  for (const path of ['/admin/design/_assets/effects/live-http.js', '/admin/design/_assets/shared/%2e%2e%2fadmin-design/controller.js', '/admin/design/unknown'])
    expect((await designSurface(request(path), allowed))?.status).toBe(404);
  expect((await designSurface(request('/admin/design/flows', 'POST'), allowed))?.status).toBe(405);
  for (const path of ['/admin-design/controller.js', '/admin-design/fixture-adapter.js', '/.env', '/shared/a/../registry.json', '/effects/live-http.js.map']) expect(isPublicAsset(path)).toBe(false);
  for (const path of ['/shared/registry.js', '/shared/components/selects.css', '/effects/live-http.js', '/assets/fonts/SpaceGrotesk.woff2']) expect(isPublicAsset(path)).toBe(true);
});
