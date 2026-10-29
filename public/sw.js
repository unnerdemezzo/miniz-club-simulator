// La versione arriva dall'URL di registrazione (/sw.js?v=x.y.z): ogni nuova versione installa un nuovo service worker
const CACHE_NAME = 'miniz-club-sim-v' + (new URL(self.location.href).searchParams.get('v') || 'dev');
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app-icon.jpg'
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
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
