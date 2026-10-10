// Testet die sanfte Pause, gemeinsam mit Zahlennest (Schlüssel nest:spielzeit / nest:pauseNach / nest:pauseAm):
// Umzug der alten Wortnest-Einstellung, Pause am Spielende, Pausen-Bild beim Öffnen eines Spiels (auch wenn die Pause
// in Zahlennest begann), Eltern beenden die Pause, Tageswert nur für Eltern. Vorher: alte Schlüssel pauseNach=15, spielzeit.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const aktiv = (id) => $(`#${id}`).classList.contains('active');
  await startFertig;
  folgeAbspielen = () => Promise.resolve();

  // 1. Umzug: alte Einstellung übernommen, alte Schlüssel weg (Zahlennest liest nur nest:…)
  pruefe(speicher.lesen('nest:pauseNach') === 15, `Einstellung nicht übernommen: ${speicher.lesen('nest:pauseNach')}`);
  pruefe(localStorage.getItem('pauseNach') === null && localStorage.getItem('spielzeit') === null, 'Alte Schlüssel noch da');

  // 2. Format genau wie Zahlennest: Zählen schreibt { ms, letzte, tag, heute }
  speicher.schreiben('nest:spielzeit', { ms: 0, letzte: 0, tag: heuteTag(), heute: 5 * 60000 });
  spielzeitZaehlen();
  const z = speicher.lesen('nest:spielzeit');
  pruefe(z && z.ms > 0 && z.letzte > 0 && z.tag === heuteTag() && z.heute > 5 * 60000, `Format: ${JSON.stringify(z)}`);
  // Spielzeit aus Zahlennest (anderer Tag) zählt heute nicht mit
  speicher.schreiben('nest:spielzeit', { ms: 3, letzte: Date.now(), tag: '2000-01-01', heute: 99 * 60000 });
  pruefe(spielzeitLesen().heute === 0, 'Gestriger Tageswert zählt heute mit');

  // 3. Fällig (z. B. 16 Min. aus beiden Apps): am Spielende Pausen-Bild, Pause beginnt, Zähler 0
  speicher.schreiben('nest:spielzeit', { ms: 16 * 60000, letzte: Date.now(), tag: heuteTag(), heute: 16 * 60000 });
  pruefe(pauseFaellig() && !pauseLaeuft(), 'Pause nicht fällig');
  zeigen('memory', false);
  spielEnde('memory', () => {});
  pruefe($('#memory .spiel-pause') && !$('#memory .spiel-pause').hidden && (!$('#memory .spiel-ende') || $('#memory .spiel-ende').hidden), 'Kein Pausen-Bild am Spielende');
  pruefe(spielzeitLesen().ms === 0 && pauseLaeuft(), 'Pause nicht begonnen');
  spielEndeWeg('memory');
  zeigen('home', false);

  // 4. Während der Pause: Spiel öffnen zeigt das Pausen-Bild statt des Spiels; 🏠 zurück
  document.querySelector('#home .spiel-btn[data-spiel="spuren"]').click();
  pruefe(aktiv('pause') && !aktiv('buchstaben'), 'Spiel trotz laufender Pause geöffnet');
  $('#btn-pause-home').click(); await pause(300);
  pruefe(aktiv('home'), 'Vom Pausen-Bild nicht zur Startseite');
  // Pause aus Zahlennest (nur nest:pauseAm gesetzt) gilt hier genauso
  speicher.schreiben('nest:pauseAm', Date.now() - 10 * 60000);
  pruefe(pauseLaeuft(), 'Pause aus Zahlennest gilt nicht');
  // Nach 30 Minuten ist die Pause vorbei
  speicher.schreiben('nest:pauseAm', Date.now() - 31 * 60000);
  pruefe(!pauseLaeuft(), 'Pause hört nicht auf');

  // 5. Elternbereich: Wahl inkl. 30 Min. (gemeinsam mit Zahlennest), Tageswert, Pause beenden
  speicher.schreiben('nest:pauseAm', Date.now());
  speicher.schreiben('nest:spielzeit', { ms: 0, letzte: Date.now(), tag: heuteTag(), heute: 18 * 60000 });
  await elternOeffnen();
  const wahl = [...$('#pause-wahl').children];
  pruefe(wahl.length === 5 && wahl[2].classList.contains('gewaehlt'), `Pausen-Wahl: ${wahl.map((b) => b.textContent)}`);
  pruefe($('#spielzeit-heute').textContent.includes('ca. 18 Min.') && $('#spielzeit-heute').textContent.includes('Zahlennest'), `Tageswert: ${$('#spielzeit-heute').textContent}`);
  pruefe(!$('#btn-pause-aus').hidden, 'Kein Knopf „Pause beenden“');
  $('#btn-pause-aus').click();
  pruefe(!pauseLaeuft() && $('#btn-pause-aus').hidden, 'Pause nicht beendet');
  wahl[4].click();
  pruefe(speicher.lesen('nest:pauseNach') === 30, '30 Minuten nicht wählbar');
  wahl[0].click();
  pruefe(speicher.lesen('nest:pauseNach') === 0 && !pauseLaeuft() && !pauseFaellig(), 'Pause nicht ausschaltbar');
  history.back(); await pause(300);

  // 6. Pause aus: normales Spielende
  zeigen('memory', false);
  spielEnde('memory', () => {});
  pruefe(!$('#memory .spiel-ende').hidden && $('#memory .spiel-pause').hidden, 'Kein normales Ende ohne Pause');
  spielEndeWeg('memory');
  zeigen('home', false);
  // Wortnest schreibt keine fremden Zahlennest-Schlüssel
  pruefe(!Object.keys(localStorage).some((k) => k.startsWith('zn:')), 'Wortnest schreibt zn:-Schlüssel');

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'PAUSE OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
