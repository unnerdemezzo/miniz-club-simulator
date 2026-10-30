import { accessEnabled, redisClient, sessionFor } from './access.mjs';

export const config = { runtime: 'nodejs' };
// Vercel's next() protocol requires a Response, including when access is off.
// Returning undefined passed the local helper test but failed on the platform.
const next = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

// Only the access pages, their files and the install icons are public. The
// game itself (index, bundles, car models) requires a server-verified session.
const publicPaths = new Set([
  '/access', '/access/', '/access.html', '/admin', '/admin/', '/admin.html',
  '/api/access', '/access-app/access-ui.js', '/access-app/access.css',
  '/sw.js', '/manifest.json', '/app-icon.jpg', '/favicon.ico',
  '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'
]);
export default async function middleware(request) {
  if (!accessEnabled(process.env)) return next();
  if (publicPaths.has(new URL(request.url).pathname)) return next();
  try {
    if (await sessionFor(request, process.env, redisClient(process.env))) return next();
    const headers = { 'Cache-Control': 'private, no-store', 'Vercel-CDN-Cache-Control': 'no-store' };
    if (request.headers.get('sec-fetch-dest') === 'document' || request.headers.get('accept')?.includes('text/html')) {
      return new Response(null, { status: 303, headers: { ...headers, Location: new URL('/access', request.url).href } });
    }
    return new Response('Accesso richiesto', { status: 401, headers });
  } catch {
    return new Response('Accesso temporaneamente non disponibile. Riprova tra poco.', {
      status: 503, headers: { 'Cache-Control': 'private, no-store', 'Vercel-CDN-Cache-Control': 'no-store' }
    });
  }
}

