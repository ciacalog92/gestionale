const CACHE_NAME = 'fixit-repair-express-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.jpg',
  './favicon-32.jpeg',
  './favicon-92.jpeg',
  './favicon-512.jpeg',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
