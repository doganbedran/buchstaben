// Testet den Offline-Speicher (sw.js): er installiert sich, und App, Ansagen und Laute liegen danach im Cache.
// (Ein Fehler in sw.js – z. B. eine doppelt geladene Datei – ließ die Installation früher still scheitern.)
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  const reg = await navigator.serviceWorker.getRegistration();
  pruefe(reg, 'Offline-Speicher nicht angemeldet');
  // Warten, bis er aktiv ist (oder die Installation scheitert)
  const ergebnis = await Promise.race([
    navigator.serviceWorker.ready.then(() => 'aktiv'),
    new Promise((r) => {
      const w = reg && (reg.installing || reg.waiting);
      if (w) w.addEventListener('statechange', () => w.state === 'redundant' && r('gescheitert'));
    }),
    new Promise((r) => setTimeout(() => r('zu langsam'), 18000)),
  ]);
  pruefe(ergebnis === 'aktiv', `Offline-Speicher: ${ergebnis}`);
  const cache = await caches.open(`buchstaben-v${APP_VERSION}`);
  for (const datei of ['index.html', 'app.js', 'audio/m-laut.wav', 'audio/ansage-kiste-aussuchen.wav', 'audio/kiste-nase.wav']) {
    pruefe(await cache.match(datei), `Nicht im Cache: ${datei}`);
  }
  pruefe((await caches.keys()).includes(`buchstaben-v${APP_VERSION}`), 'Cache-Name passt nicht zu APP_VERSION');
  // Schrift Andika: mitgeliefert, offline im Cache und wirklich geladen (sonst zeigt jedes Gerät seine eigene Schrift)
  for (const w of ['400', '700']) pruefe(await cache.match(`fonts/andika-latin-${w}.woff2`), `Schrift ${w} nicht im Cache`);
  await document.fonts.load('700 20px Andika', 'Wortnest');
  await document.fonts.load('400 20px Andika', 'Wortnest');
  const geladen = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Andika' && f.status === 'loaded').map((f) => f.weight);
  pruefe(geladen.includes('400') && geladen.includes('700'), `Andika nicht geladen: ${geladen}`);
  pruefe(getComputedStyle(document.body).fontFamily.startsWith('"Andika"') || getComputedStyle(document.body).fontFamily.startsWith('Andika'), 'Body nicht in Andika');

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'OFFLINE OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
