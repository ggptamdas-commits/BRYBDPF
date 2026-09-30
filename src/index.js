// Standalone Worker compatibility entry point.
// API behavior is delegated to the canonical Pages Functions handler so the two
// deployments cannot diverge in authentication, Telegram, or database logic.
import publicHtml from './public_html.js';
import adminHtml from './admin_html.js';
import { onRequest } from '../functions/[[path]].js';

const HTML_SECURITY = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy-Report-Only': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
      return new Response(publicHtml, { headers: HTML_SECURITY });
    }
    if (request.method === 'GET' && (path === '/admin' || path === '/admin/' || path === '/admin.html')) {
      return new Response(adminHtml, { headers: HTML_SECURITY });
    }
    return onRequest({
      request,
      env,
      waitUntil: promise => ctx.waitUntil(promise),
      next: () => env.ASSETS
        ? env.ASSETS.fetch(request)
        : new Response('Not Found', { status: 404 })
    });
  }
};
