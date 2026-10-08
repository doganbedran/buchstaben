// Testet das Hör-Spiel: Rundenauswahl, richtig/falsch, Fortschritt, Audiodateien.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  einstellungenSpeichern = () => Promise.resolve();

  // 1. Rundenauswahl: 3 verschiedene Bilder, Ziel dabei, keine ähnlichen Laute, nie ß
  for (let i = 0; i < 2000; i++) {
    const { ziel, karten } = hoerRundeWaehlen();
    const gruppen = karten.map((e) => lautGruppe(e.b));
    if (karten.length !== 3 || !karten.includes(ziel) || new Set(gruppen).size !== 3 || karten.some((e) => e.b === 'ß')) {
      fehler.push(`Runde falsch: ${karten.map((e) => e.b).join(',')} Ziel ${ziel.b}`);
      break;
    }
  }

  // 2. Spiel starten über die Spiele-Leiste
  document.querySelector('.spiel-btn[data-spiel="hoeren"]').click();
  pruefe($('#hoeren').classList.contains('active'), 'Hör-Spiel nicht geöffnet');
  pruefe(document.querySelectorAll('.hoer-karte').length === 3, 'Nicht 3 Karten');

  // 3. Falsche Karte: wackelt, zählt nicht, zweimal antippen ändert nichts
  const karten = [...document.querySelectorAll('.hoer-karte')];
  const falsch = karten.find((k) => k.getAttribute('aria-label') !== hoerSpiel.ziel.wort);
  falsch.click(); falsch.click();
  pruefe(falsch.classList.contains('falsch') && hoerSpiel.runde === 0, 'Falsche Karte falsch behandelt');

  // 4. Fünf richtige Runden
  for (let r = 1; r <= HOER_RUNDEN; r++) {
    const richtig = [...document.querySelectorAll('.hoer-karte')].find((k) => k.getAttribute('aria-label') === hoerSpiel.ziel.wort);
    richtig.click();
    richtig.click();   // doppelt tippen darf nicht doppelt zählen
    pruefe(hoerSpiel.runde === r, `Nach Runde ${r}: ${hoerSpiel.runde}`);
    clearTimeout(hoerSpiel.timer);
    if (r < HOER_RUNDEN) hoerNeueRunde();
  }
  pruefe(document.querySelectorAll('#hoeren-runden .voll').length === HOER_RUNDEN, 'Fortschrittspunkte falsch');

  // 5. Alle Audiodateien vorhanden
  const dateien = [...BUCHSTABEN.filter((e) => e.b !== 'ß').map((e) => `audio/${dateiName(e.b)}-laut.wav`),
    'audio/ansage-hoeren.wav', 'audio/ansage-hoeren-nochmal.wav', 'audio/ansage-runde-geschafft.wav'];
  for (const d of dateien) {
    const r = await fetch(d, { method: 'HEAD' });
    if (!r.ok) fehler.push(`fehlt: ${d}`);
  }

  // Für den Screenshot: frische Runde, eine Karte falsch
  hoerSpiel.runde = 2; hoerNeueRunde();
  [...document.querySelectorAll('.hoer-karte')].find((k) => k.getAttribute('aria-label') !== hoerSpiel.ziel.wort).classList.add('falsch');
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : `HÖR-TESTS OK (Ziel: ${hoerSpiel.ziel.b})`;
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
