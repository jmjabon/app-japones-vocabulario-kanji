const CACHE_NAME = 'kanjimaster-v1';

// Recursos críticos a precachear en la instalación
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './manifest.webmanifest'
];

// CDNs externas que aplican Cache First
const STATIC_CDNS = [
    'cdn.tailwindcss.com',
    'unpkg.com',
    'cdn.iconscout.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignorar peticiones que no sean GET
    if (event.request.method !== 'GET') return;

    // ESTRATEGIA 1: Cache First para CDNs externas
    const isStaticCDN = STATIC_CDNS.some((domain) => url.hostname.includes(domain));
    if (isStaticCDN) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                });
            })
        );
        return;
    }

    // ESTRATEGIA 2: Network First para datos propios (JSON, JS, HTML)
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Si la red responde correctamente, actualizamos la copia en caché
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Fallback sin conexión: recupera la última versión en disco
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Si se solicita una página y no hay caché exacta, sirve index.html
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});