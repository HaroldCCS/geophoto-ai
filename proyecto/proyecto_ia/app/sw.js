/**
 * GeoPhoto AI - Service Worker Autónomo PWA
 * Soporte Offline Total para Web, Escritorio (Windows/Mac/Linux) y Móvil (Android/iOS)
 */

const CACHE_VERSION = 'geophoto-v2.0.0';
const STATIC_CACHE = `geophoto-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `geophoto-runtime-${CACHE_VERSION}`;

// Recursos estáticos fundamentales pre-cacheados en la instalación (100% Autónomos y Locales)
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './modules/projects.js',
  './modules/metadata-core.js',
  './modules/ai-extract.js',
  './modules/versions.js',
  './modules/cloud.js',
  './lib/tesseract/tesseract.min.js',
  './lib/tesseract/worker.min.js',
  './lib/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  './lib/tesseract/core/tesseract-core-lstm.wasm.js',
  './lib/tesseract/lang/eng.traineddata.gz',
  './manifest.json',
  './lib/tailwind.js',
  './lib/phosphor/style.css',
  './lib/phosphor/Phosphor-Bold.woff2',
  './lib/leaflet/leaflet.css',
  './lib/leaflet/leaflet.js',
  './lib/jszip.min.js',
  './lib/docx.umd.js',
  './lib/xlsx.full.min.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
  './icons/favicon.svg'
];

// 1. EVENTO INSTALL: Pre-cachear todo el núcleo de la aplicación de forma 100% local
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      // Cachear todos los archivos locales garantizados
      await staticCache.addAll(PRECACHE_URLS);

      // Activar inmediatamente este Service Worker sin esperar a recarga
      await self.skipWaiting();
    })()
  );
});

// 2. EVENTO ACTIVATE: Limpieza de versiones obsoletas y toma de control de clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('geophoto-') && name !== STATIC_CACHE && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log('[ServiceWorker] Eliminando caché obsoleta:', name);
            return caches.delete(name);
          })
      );
      // Tomar el control de todas las pestañas abiertas inmediatamente
      await self.clients.claim();
    })()
  );
});

// 3. EVENTO FETCH: Estrategia de Servido Autónomo Offline-First
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Solo gestionar peticiones HTTP/HTTPS GET
  if (request.method !== 'GET') {
    return;
  }

  // Nunca interceptar las APIs de Google (OAuth, Drive, Sheets): deben ir siempre a la red
  if (/(^|\.)(googleapis\.com|google\.com|gstatic\.com|googleusercontent\.com)$/.test(url.hostname)) {
    return;
  }

  // A. Peticiones de navegación (Carga de la aplicación HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Intentar red primero para obtener la versión más reciente si hay conexión
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
            return networkResponse;
          }
        } catch (err) {
          // Si no hay red (100% offline), responder con el index.html cacheado
        }
        const cachedIndex = await caches.match('./index.html', { ignoreSearch: true }) || 
                            await caches.match('./', { ignoreSearch: true });
        return cachedIndex || new Response('GeoPhoto AI Offline. Recargue cuando se conecte.', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      })()
    );
    return;
  }

  // B. Recursos estáticos locales (JS, CSS, Libs, Iconos): Network-First con respaldo en caché.
  //    Con red siempre se sirve la versión más nueva (evita código viejo tras actualizar);
  //    sin red se responde desde la caché precargada.
  const isLocalStatic = url.origin === self.location.origin;
  if (isLocalStatic) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          const cachedResponse = await caches.match(request, { ignoreSearch: true });
          if (cachedResponse) return cachedResponse;
          // Si falló la red, intentar buscar por nombre de archivo relativo precacheado
          const filename = url.pathname.split('/').pop() || 'index.html';
          const relativeFallback = await caches.match('./' + filename, { ignoreSearch: true });
          if (relativeFallback) {
            return relativeFallback;
          }
          return new Response('', { status: 404, statusText: 'Not found offline' });
        }
      })()
    );
    return;
  }

  // C. Recursos externos de CDNs (Tailwind, Phosphor Icons, Leaflet, Unsplash, Google Maps Tiles)
  event.respondWith(
    (async () => {
      // 1. Buscar en caché primero
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) {
        // En background intentar actualizar si hay conexión
        fetch(request).then(async (fresh) => {
          if (fresh && (fresh.ok || fresh.type === 'opaque')) {
            const runtimeCache = await caches.open(RUNTIME_CACHE);
            runtimeCache.put(request, fresh);
          }
        }).catch(() => {/* Offline silencioso */});
        return cached;
      }

      // 2. Si no está en caché, ir a red y guardar en caché de runtime si es posible
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
          try {
            const runtimeCache = await caches.open(RUNTIME_CACHE);
            runtimeCache.put(request, networkResponse.clone());
          } catch (cachePutErr) {
            // Silencioso ante respuestas opacas o redirigidas
          }
        }
        return networkResponse;
      } catch (err) {
        // Si es una imagen y falló offline, responder con placeholder SVG local
        if (request.destination === 'image') {
          // Si es un mosaico de mapa, responder 404 para que el mini-mapa active su renderizado vectorial local en canvas
          if (url.href.includes('cartocdn.com') || url.href.includes('openstreetmap.org')) {
            return new Response('', { status: 404, statusText: 'Tile Offline' });
          }
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150"><rect width="200" height="150" fill="#1e293b"/><text x="100" y="75" fill="#94a3b8" font-size="12" text-anchor="middle" font-family="sans-serif">Imagen Offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
        return new Response('', { status: 404, statusText: 'Recurso no disponible offline' });
      }
    })
  );
});

// 4. MENSAJERÍA ENTRE PÁGINA Y SERVICE WORKER
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
