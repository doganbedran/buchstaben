// Testet die Montessori-Reihenfolge (Freischalten). Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  await startFertig;
  window.confirm = () => true;
  const gespielt = [];
  folgeAbspielen = (folge) => { gespielt.push(folge.map((q) => q.url)); return Promise.resolve(); };
  const freiText = () => [...freigeschaltet()].join('');

  // 1. Standard: A bis Z, alles offen
  rasterZeichnen();
  pruefe(freigeschaltet().size === 30 && !document.querySelector('.kachel.gesperrt'), 'Standard sollte alles offen haben');

  // 2. Montessori über die Einstellung
  await elternOeffnen();
  document.querySelector('input[name="reihenfolge"][value="montessori"]').click();
  history.back(); await warte(300);
  pruefe(zustand.reihenfolge === 'montessori' && speicher.lesen('reihenfolge') === 'montessori', 'Einstellung nicht gespeichert');
  rasterZeichnen();
  pruefe(freiText() === 'masl', `Start: ${freiText()}`);
  pruefe(document.querySelectorAll('.kachel.gesperrt').length === 26, 'Nicht 26 gesperrt');
  pruefe(document.querySelector('.kachel').getAttribute('aria-label').startsWith('m '), 'Erste Kachel sollte m sein');

  // 3. Gesperrte Kachel öffnet nichts
  document.querySelector('.kachel.gesperrt').click();
  pruefe($('#home').classList.contains('active'), 'Gesperrte Kachel hat geöffnet');

  // 4. Freischalten: m, a, s mit 2 Sternen, l mit 1 – dann l schaffen
  Object.assign(zustand.sterne, { m: 2, a: 2, s: 2, l: 1 });
  pruefe(freiText() === 'masl', 'Zu früh freigeschaltet');
  zustand.index = BUCHSTABEN.findIndex((e) => e.b === 'l');
  zustand.wahl = hauptWahl(BUCHSTABEN[zustand.index]);
  gespielt.length = 0;
  geschafft();
  clearTimeout(tafelZustand.jubelTimer);
  await warte(650);
  pruefe(freiText() === 'masloien', `Nach l: ${freiText()}`);
  pruefe((gespielt[gespielt.length - 1] || []).includes('audio/ansage-neue-buchstaben.wav'), 'Keine Ansage "Neue Buchstaben"');
  pruefe($('#jubel').classList.contains('mit-schloss'), 'Kein Schloss im Jubel');

  // 5. Weiter-Knopf geht zum nächsten offenen Buchstaben in Montessori-Reihenfolge (l -> o)
  zustand.index = BUCHSTABEN.findIndex((e) => e.b === 'l');
  $('#btn-weiter').click();
  pruefe(BUCHSTABEN[zustand.index].b === 'o', `Weiter nach l: ${BUCHSTABEN[zustand.index].b}`);
  clearTimeout(tafelZustand.jubelTimer);

  // 6. Hör-Spiel sucht nur offene Laute, Memory nimmt offene Buchstaben
  const frei = freigeschaltet();
  for (let i = 0; i < 500; i++) if (!frei.has(hoerRundeWaehlen().ziel.b)) { fehler.push('Hör-Spiel sucht gesperrten Laut'); break; }
  for (let i = 0; i < 200; i++) { memoryNeu(); if (memory.karten.some((k) => !frei.has(k.b))) { fehler.push(`Memory mit gesperrtem Buchstaben ${memory.karten.map((k) => k.b)}`); break; } }

  // 7. Pro Kind einstellbar
  window.prompt = () => 'Lina';
  $('#btn-kind-neu').click(); await warte(400);
  const lina = kinder.find((k) => k.name === 'Lina');
  pruefe(lina.reihenfolge === 'montessori', 'Erstes Kind übernimmt die Reihenfolge nicht');
  document.querySelector('input[name="kind-reihenfolge"][value="alphabet"]').click(); await warte(300);
  pruefe((await datenbank.kinder()).find((k) => k.id === lina.id).reihenfolge === 'alphabet', 'Kind-Einstellung nicht gespeichert');
  history.back(); await warte(300); history.back(); await warte(300);
  await kindWaehlen(lina.id);
  pruefe(freigeschaltet().size === 30, 'Lina (A bis Z) sollte alles offen haben');

  // Ansicht: Montessori-Startseite
  zustand.reihenfolge = 'montessori';
  zustand.sterne = { m: 2, a: 3, s: 2, l: 2, o: 1 };
  rasterZeichnen(); zeigen('home', false);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'MONTESSORI-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
