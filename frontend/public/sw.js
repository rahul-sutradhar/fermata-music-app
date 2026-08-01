const CACHE_NAME = 'fermata-shell-v1';
const ASSETS = [
  './',
  'index.html',
  'favicon.svg',
  'manifest.json'
];

// Install Event - Pre-cache critical shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('[Service Worker] Static assets pre-cache failed:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up stale cache databases
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && !key.startsWith('fermata-audio-')) {
            console.log('[Service Worker] Cleaning up stale cache database:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Stale-While-Revalidate caching pattern for frontend assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache assets from the application origin, avoiding caching API/key endpoints
  if (url.origin === self.location.origin && !url.pathname.includes('/api/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from cache immediately and fetch background updates
          fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(event.request);
      })
    );
  }
});
