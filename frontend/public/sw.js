// SNR NEST Service Worker (Day 8 PWA Engine)
// Strict Security Rule: Never cache authenticated API endpoints or private PDF/evidence documents.

const CACHE_NAME = 'snr-nest-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Allow offline assets to be cached progressively
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // RULE 1: Never intercept or cache non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // RULE 2: Never cache /api/ endpoints, auth routes, or download routes
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/download') ||
    url.pathname.includes('/evidence') ||
    url.pathname.includes('/reports')
  ) {
    return; // Pass through directly to network
  }

  // RULE 3: Cache-first for same-origin static assets; fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (
          !response ||
          response.status !== 200 ||
          response.type !== 'basic' ||
          url.pathname.startsWith('/api/')
        ) {
          return response;
        }
        // Cache static JS/CSS/image assets
        if (
          url.pathname.match(/\.(js|css|svg|png|jpg|jpeg|woff2?)$/) ||
          url.pathname === '/'
        ) {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, toCache);
          });
        }
        return response;
      });
    })
  );
});

