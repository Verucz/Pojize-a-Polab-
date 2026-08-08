// Service worker pro appku Pojizeří a Polabí
// Cachuje jen "app shell" (HTML stránku, ikony, knihovny) — ne mapové dlaždice
// ani data ze Supabase, ta vždy potřebují připojení k internetu.

const CACHE_VERSION = 'poapo-v2';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // addAll by selhalo celé, pokud by jediná položka (např. cizí CDN) nešla stáhnout —
      // proto přidáváme po jednom a chyby ignorujeme.
      return Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Mapové dlaždice a Supabase volání necháváme vždy jít na síť (nechceme je cachovat)
  if (url.includes('tile.openstreetmap.org') || url.includes('supabase.co/rest') || url.includes('supabase.co/auth') || url.includes('supabase.co/storage')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      // cache-first pro rychlost, ale na pozadí obnovíme cache (stale-while-revalidate)
      return cached || networkFetch;
    })
  );
});

// Klepnutí na notifikaci o blízkém místě otevře appku (případně rovnou to místo)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const placeId = event.notification.data && event.notification.data.placeId;
  const targetUrl = placeId ? `/?place=${encodeURIComponent(placeId)}` : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

