/* Hablame PWA – Service Worker
   Estrategia: network-first; cache solo sin conexion.
   Subir CACHE_NAME en cada publicacion.
*/
const CACHE_NAME = 'hablame-v27';

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

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
  './js/live.js',
  './js/live-pronounce.js',
  './js/theme.js',
  './js/tts.js',
  './js/icons.js',
  './js/pedagogy.js',
  './js/learning.js',
  './js/views/bienvenida.js',
  './js/views/charla.js',
  './js/views/temas.js',
  './js/views/palabras.js',
  './js/views/ajustes.js',
  './assets/logo.png',
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
