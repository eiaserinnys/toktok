import {handleAdminDesign, type AdminAuthorization} from './admin-design-route';

export interface AssetPort {fetch(request: Request): Promise<Response>;}
export interface DesignSurfacePorts {
  assets: AssetPort;
  authorizeAdmin?: (request: Request) => Promise<AdminAuthorization>;
}

const rootAssets = new Set(['/styles.css', '/app.js', '/view.js', '/session.js',
  '/public-demo.js', '/public-demo-session.js', '/public-demo-view.js', '/favicon.svg']);
const productModule = /^\/(?:shared|effects)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:js|css)$/;
const staticAsset = /^\/assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:woff2?|svg|png|jpe?g|webp|ico)$/;

export function isPublicAsset(path: string): boolean {
  return rootAssets.has(path) || productModule.test(path) || staticAsset.test(path);
}

/** Internal rewrite only; authorization always runs before resolving even unknown paths. */
export async function designSurface(request: Request, ports: DesignSurfacePorts): Promise<Response | null> {
  return handleAdminDesign(request, {
    authorizeAdmin: ports.authorizeAdmin,
    handle: async () => {
      const path = new URL(request.url).pathname;
      let target: string | undefined;
      if (/^\/admin\/design(?:\/(?:components|dialogues|flows))?\/?$/.test(path)) {
        target = '/admin-design/index.html';
      } else {
        const asset = /^\/admin\/design\/_assets\/((?:admin-design|shared)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:js|css|json))$/.exec(path);
        if (asset) target = '/' + asset[1];
      }
      if (!target) return null;
      const url = new URL(target, request.url);
      return ports.assets.fetch(new Request(url, {method: request.method}));
    }
  });
}
