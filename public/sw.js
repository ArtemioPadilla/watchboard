// Watchboard Service Worker
// Strategy: cache-first for static assets, network-first for HTML, stale-while-revalidate for data JSON
const CACHE_VERSION = 'wb-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const HTML_CACHE = `${CACHE_VERSION}-html`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const STATIC_EXTENSIONS = [
  '.css', '.js', '.woff', '.woff2', '.png', '.jpg', '.jpeg',
  '.svg', '.webp', '.ico', '.gif', '.avif',
];

function isStaticAsset(url) {
  const pathname = new URL(url).pathname;
  // Fonts, images, textures, Cesium workers, compiled JS/CSS bundles
  return STATIC_EXTENSIONS.some(ext => pathname.endsWith(ext))
    || pathname.includes('/fonts/')
    || pathname.includes('/textures/')
    || pathname.includes('/cesium/');
}

function isDataFile(url) {
  const pathname = new URL(url).pathname;
  return pathname.endsWith('.json') && !pathname.endsWith('manifest.json');
}

function isHTMLNavigation(request) {
  return request.mode === 'navigate'
    || (request.headers.get('accept') || '').includes('text/html');
}

// --- Install: precache nothing, let runtime caching handle it ---
self.addEventListener('install', event => {
  self.skipWaiting();
});

// --- Activate: clean old caches ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('wb-') && !key.startsWith(CACHE_VERSION))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// --- Fetch handler ---
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (APIs, CDNs we don't control)
  if (!request.url.startsWith(self.location.origin)) return;

  if (isHTMLNavigation(request)) {
    // Network-first for HTML pages — fall back to cache for offline
    event.respondWith(networkFirst(request, HTML_CACHE));
  } else if (isDataFile(request.url)) {
    // Stale-while-revalidate for JSON data files
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
  } else if (isStaticAsset(request.url)) {
    // Cache-first for static assets (CSS, JS, fonts, images, textures)
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
  // All other requests: let the browser handle normally (no interception)
});

// --- Strategies ---

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not in cache — return a basic offline response
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Nothing in cache either — return a minimal offline page
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title>'
      + '<style>body{background:#0d1117;color:#c9d1d9;font-family:system-ui;display:flex;'
      + 'align-items:center;justify-content:center;min-height:100vh;margin:0}'
      + 'div{text-align:center}h1{font-size:1.5rem;margin-bottom:.5rem}'
      + 'p{opacity:.7;font-size:.9rem}</style></head>'
      + '<body><div><h1>Watchboard is offline</h1>'
      + '<p>Check your connection and try again.</p></div></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Fire off revalidation in the background
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  // Return cached immediately if available, otherwise wait for network
  return cached || fetchPromise;
}

// --- Push Notification handlers ---

self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Watchboard Update',
      body: event.data.text(),
    };
  }

  const { title, body, icon, image, url, tag, tracker } = payload;

  const notificationOptions = {
    body: body || '',
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: tag || `wb-${tracker || 'update'}-${Date.now()}`,
    data: { url: url || '/' },
    vibrate: [200, 100, 200],
  };

  // Add image if available (shows large image in notification on supported platforms)
  if (image) {
    notificationOptions.image = image;
  }

  event.waitUntil(
    self.registration.showNotification(title || 'Watchboard', notificationOptions)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Focus an existing tab if one is open on the site
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return clients.openWindow(targetUrl);
    })
  );
});
