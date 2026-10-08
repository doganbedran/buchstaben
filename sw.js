// Offline-Cache: Mit Internet immer die neueste Version laden, ohne Internet aus dem Cache.
importScripts('letters.js');

const CACHE = 'buchstaben-v4';
const DATEIEN = [
  './', 'index.html', 'style.css', 'app.js', 'letters.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png',
  ...[1, 2, 3, 4, 5].map((i) => `audio/lob-${i}.wav`),
  ...BUCHSTABEN.flatMap(({ b }) => [`audio/${dateiName(b)}.wav`, `audio/${dateiName(b)}-wort.wav`]),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        if (antwort.ok && new URL(e.request.url).origin === location.origin) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
