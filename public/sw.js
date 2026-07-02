const CACHE_NAME = 'vibematch-shell-v1';
const PRECACHE_URLS = [
  '/',
  '/app.html',
  '/dashboard.html',
  '/assets/logo.svg',
  '/app.js',
  '/dashboard.js',
  '/filters.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Basic fetch handler: network first, fallback to cache, then offline placeholder
self.addEventListener('fetch', (event) => {
  const request = event.request;
  // only handle GET
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request).then((response) => {
      // put a copy in cache for future
      const respClone = response.clone();
      caches.open(CACHE_NAME).then((cache) => { try { cache.put(request, respClone); } catch(e){} });
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match('/assets/logo.svg').then(svg=> svg)))
  );
});

// simple message listener to skipWaiting on update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
