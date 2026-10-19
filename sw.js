/* HÃ¡blame PWA â€“ Service Worker  v1
   Estrategia: network-first; cachÃ© solo sin conexiÃ³n.
   Subir CACHE_NAME en cada publicaciÃ³n.
*/
const CACHE_NAME = 'hablame-v2';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './js/router.js',
  './js/db.js',
  './js/gemini.js',
  './js/pedagogy.js',
  './js/learning.js',
  './js/views/bienvenida.js',
  './js/views/charla.js',
  './js/views/temas.js',
  './js/views/palabras.js',
  './js/views/ajustes.js',
  './assets/turpial.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Solo peticiones GET de mismo origen
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

