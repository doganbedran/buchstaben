// Offline-Cache: Mit Internet immer die neueste Version laden, ohne Internet aus dem Cache.
importScripts('letters.js', 'kisten.js', 'ansagen.js', 'reime.js', 'ansagen.js');

const CACHE = 'buchstaben-v58';   // gleiche Nummer wie APP_VERSION in app.js
const DATEIEN = [
  './', 'index.html', 'style.css', 'app.js', 'letters.js', 'kisten.js', 'striche.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png',
  ...[1, 2, 3, 4, 5].map((i) => `audio/lob-${i}.wav`),
  ...BUCHSTABEN.filter(({ bild }) => bild.startsWith('bilder/')).map(({ bild }) => bild),
  ...BUCHSTABEN.flatMap(({ b }) => [`audio/${dateiName(b)}.wav`, `audio/${dateiName(b)}-wort.wav`, `audio/${dateiName(b)}-laut.wav`]),
  ...Object.keys(ANSAGEN).map((a) => `audio/ansage-${a}.wav`),
  ...BUCHSTABEN.flatMap(({ b, mehr }) => (mehr || []).flatMap((_, i) => [`audio/${dateiName(b)}-${i + 2}.wav`, `audio/${dateiName(b)}-${i + 2}-wort.wav`])),
  ...KISTEN.flatMap((k) => k.woerter.map(([id]) => kisteDatei(id))),
  ...Object.keys(TIERLAUTE).map(tierDatei),
  // nur die neuen Reim-Wörter (die übrigen stehen schon oben; addAll darf keine Datei doppelt haben)
  ...REIME.flatMap((p) => p.woerter).map((w) => w[3]).filter((d) => d.startsWith('audio/reim-')),
];
// Silben-Aufnahmen kommen nach und nach dazu: fehlende Dateien dürfen die Installation nicht verhindern
const SILBEN_DATEIEN = Object.entries(SILBEN).flatMap(([wort, teile]) => teile.map((_, i) => silbenDatei(wort, i + 1)));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(DATEIEN).then(() => Promise.allSettled(SILBEN_DATEIEN.map((d) => c.add(d)))))
    .then(() => self.skipWaiting()));
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
  const eigeneSeite = new URL(e.request.url).origin === location.origin;
  // cache: 'no-cache' umgeht den 10-Minuten-Browsercache von GitHub Pages (fragt per ETag nach, meist nur "304")
  const anfrage = eigeneSeite ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request);
  e.respondWith(
    anfrage
      .then((antwort) => {
        if (antwort.ok && eigeneSeite) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
