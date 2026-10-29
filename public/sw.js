// La versione arriva dall'URL di registrazione (/sw.js?v=x.y.z): ogni nuova versione installa un nuovo service worker.
// Come in Slot Car: prima la rete (così arrivano subito le nuove versioni), se manca si usa la copia salvata,
// e ogni file del sito scaricato viene salvato, così l'app installata si apre anche senza internet.
const CACHE_NAME = 'miniz-club-sim-v' + (new URL(self.location.href).searchParams.get('v') || 'dev');
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app-icon.jpg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameSite = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameSite && !isFont) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque') && !req.headers.has('range')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match('/index.html')) || (await caches.match('/'));
        return Response.error();
      })
  );
});
