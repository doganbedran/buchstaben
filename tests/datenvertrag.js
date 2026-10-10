// Testet den Datenvertrag mit Zahlennest (docs/datenvertrag.md): Zahlennest liest „lernapp“ für „Aus Wortnest
// übernehmen“. Schlägt an, wenn sich Datenbank, Speicher oder Felder ändern – dann erst mit Zahlennest abstimmen.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  const bild = await new Promise((r) => { const c = document.createElement('canvas'); c.width = c.height = 8; c.toBlob(r, 'image/png'); });
  const ton = new Blob(['x'], { type: 'audio/webm' });

  // So legt Wortnest selbst Daten an (über die eigenen Funktionen)
  await datenbank.profilSpeichern({ id: 'p-oma', name: 'Oma', erstellt: 1, woerter: [{ id: 'w1', b: 'o', wort: 'Oma' }],
    kistenWoerter: [{ id: 'k1', kiste: 'leute', wort: 'Oma', name: true }] });
  await datenbank.medienSetzen('p-oma', 'ich', 'bild', bild);
  await datenbank.medienSetzen('p-oma', 'lob-1', 'stimme', ton);
  await datenbank.medienSetzen('p-oma', 'w-k1', 'stimme', ton);
  await datenbank.kindSpeichern({ id: 'k-lina', name: 'Lina', tier: '🦊', foto: bild, nameStimme: ton, schreibweise: 'klein',
    sterne: {}, profil: 'p-oma', lobGaeste: ['p-oma'], erstellt: 1 });

  // So liest Zahlennest: ohne Versionsnummer öffnen (nie ein Upgrade auslösen), nur lesen
  const db = await new Promise((ok, nein) => {
    const req = indexedDB.open('lernapp');
    req.onupgradeneeded = () => { req.transaction.abort(); nein(new Error('lernapp fehlt')); };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => nein(req.error);
  });
  pruefe(db.version === 3, `Version ${db.version} statt 3`);
  for (const s of ['kinder', 'profile', 'medien']) pruefe(db.objectStoreNames.contains(s), `Speicher fehlt: ${s}`);
  const alle = (store) => new Promise((ok) => {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    const werte = os.getAll(); const keys = os.getAllKeys();
    tx.oncomplete = () => ok(werte.result.map((w, i) => ({ key: keys.result[i], w })));
  });
  pruefe(db.transaction('kinder').objectStore('kinder').keyPath === 'id' && db.transaction('profile').objectStore('profile').keyPath === 'id', 'keyPath nicht „id“');

  const kind = (await alle('kinder')).find((x) => x.key === 'k-lina');
  pruefe(kind, 'Kind nicht unter seiner id');
  if (kind) {
    const k = kind.w;
    pruefe(typeof k.name === 'string' && typeof k.tier === 'string' && k.profil === 'p-oma', 'Kind: name/tier/profil');
    pruefe(k.foto instanceof Blob && k.nameStimme instanceof Blob, 'Kind: foto/nameStimme sind keine Blobs');
    pruefe(Array.isArray(k.lobGaeste) && k.lobGaeste[0] === 'p-oma', 'Kind: lobGaeste');
  }
  const mensch = (await alle('profile')).find((x) => x.key === 'p-oma');
  pruefe(mensch && mensch.w.name === 'Oma' && Array.isArray(mensch.w.kistenWoerter)
    && mensch.w.kistenWoerter[0].kiste === 'leute' && mensch.w.kistenWoerter[0].name === true, 'Profil/„Meine Leute“-Format');
  const medien = await alle('medien');
  const schluessel = medien.map((m) => m.key);
  for (const s of ['p-oma|ich|bild', 'p-oma|lob-1|stimme', 'p-oma|w-k1|stimme']) pruefe(schluessel.includes(s), `Medien-Schlüssel fehlt: ${s}`);
  pruefe(medien.filter((m) => m.key.startsWith('p-oma|')).every((m) => m.w instanceof Blob), 'Medien-Wert ist kein Blob');
  pruefe(schluessel.every((s) => /^[^|]+\|[^|]+\|(bild|stimme)$/.test(s)), 'Medien-Schlüssel nicht „profil|platz|art“');
  db.close();

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'DATENVERTRAG OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
