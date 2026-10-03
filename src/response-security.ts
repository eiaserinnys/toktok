/** The host selects this policy from its matched route, never from request headers. */
export type ResponsePolicy = 'product' | 'design-review';
export const DESIGN_REVIEW_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";
const PRODUCT_CSP = "default-src 'self'; frame-ancestors 'none'; base-uri 'none'";

export function isDesignReviewPath(path: string): boolean {
  return ['/admin/design', '/api/admin/design'].some(prefix => path === prefix || path.startsWith(prefix + '/'));
}

/** Apply after all inner handlers, including error/Assets responses and legacy secure(). */
export function secureResponse(response: Response, policy: ResponsePolicy = 'product'): Response {
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control', 'no-store');
  result.headers.set('Referrer-Policy', 'no-referrer');
  result.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Content-Security-Policy', policy === 'design-review' ? DESIGN_REVIEW_CSP : PRODUCT_CSP);
  return result;
}

export function secureRouteResponse(request: Request, response: Response): Response {
  return secureResponse(response, isDesignReviewPath(new URL(request.url).pathname) ? 'design-review' : 'product');
}
