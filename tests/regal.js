// Testet das Spiele-Regal (welche Spiele auf der Startseite stehen). Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  await startFertig;
  window.confirm = () => true;
  folgeAbspielen = () => Promise.resolve();
  const sichtbar = () => [...document.querySelectorAll('#home .spiel-btn')].filter((b) => !b.hidden).map((b) => b.dataset.spiel).join(',');
  silben.bereit = new Set(Object.keys(SILBEN));   // so tun, als wären alle Silben-Aufnahmen da

  // 1. Neues Gerät: kleines Regal (✍️ nur mit Kind)
  rasterZeichnen();
  pruefe(sichtbar() === 'spuren,hoeren,silben,album', `Start-Regal: ${sichtbar()}`);

  // 2. App-weit im Elternbereich: Memory dazu, Album weg; letztes Spiel bleibt
  await elternOeffnen();
  const knopf = (box, id) => [...$(box).querySelectorAll('.regal-spiel')][ALLE_SPIELE.indexOf(id)];
  knopf('#spiele-wahl', 'memory').click();
  knopf('#spiele-wahl', 'album').click();
  pruefe(speicher.lesen('spiele').join(',') === 'spuren,hoeren,silben,name,memory', `Gespeichert: ${speicher.lesen('spiele')}`);
  ['spuren', 'hoeren', 'silben', 'name', 'memory'].forEach((id) => knopf('#spiele-wahl', id).click());
  pruefe(zustand.spiele.length === 1, `Letztes Spiel abwählbar: ${zustand.spiele}`);
  history.back(); await warte(300);
  rasterZeichnen();
  pruefe(sichtbar() === 'memory', `Nach Auswahl: ${sichtbar()}`);

  // 3. Kinder: das erste übernimmt das Regal, jedes weitere beginnt mit dem Start-Regal; je Kind einstellbar
  window.prompt = () => 'Lina';
  await elternOeffnen();
  $('#btn-kind-neu').click(); await warte(400);
  const lina = kinder.find((k) => k.name === 'Lina');
  pruefe(lina.spiele.join(',') === 'memory', `Lina übernimmt nicht: ${lina.spiele}`);
  knopf('#kind-spiele', 'legen').click(); await warte(300);
  pruefe((await datenbank.kinder()).find((k) => k.id === lina.id).spiele.join(',') === 'memory,legen', 'Kind-Regal nicht gespeichert');
  history.back(); await warte(300); history.back(); await warte(300);
  window.prompt = () => 'Emil';
  await elternOeffnen();
  $('#btn-kind-neu').click(); await warte(400);
  const emil = kinder.find((k) => k.name === 'Emil');
  pruefe(emil.spiele.join(',') === START_REGAL.join(','), `Emil: ${emil.spiele}`);
  history.back(); await warte(300); history.back(); await warte(300);
  await kindWaehlen(emil.id); rasterZeichnen();
  pruefe(sichtbar() === 'spuren,hoeren,silben,name,album', `Emil sieht: ${sichtbar()}`);
  await kindWaehlen(lina.id); rasterZeichnen();
  pruefe(sichtbar() === 'memory,legen', `Lina sieht: ${sichtbar()}`);

  // 4. Altes Kind ohne Regal-Feld sieht alle Spiele
  delete aktivesKind().spiele; einstellungenLaden(); rasterZeichnen();
  pruefe(sichtbar().split(',').length === ALLE_SPIELE.length, `Altes Kind: ${sichtbar()}`);

  // 5. Sicherung enthält das Regal
  const sicherung = await sicherungErstellen();
  pruefe(sicherung.kinder.some((k) => k.spiele && k.spiele.join(',') === START_REGAL.join(',')), 'Regal fehlt in der Sicherung');

  // Ansicht: Kind-Formular mit Regal (zur Regal-Karte gescrollt)
  await elternOeffnen();
  kindBearbeiten(emil.id); await warte(400);
  $('#kind-spiele').scrollIntoView({ block: 'center' });
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'REGAL-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
