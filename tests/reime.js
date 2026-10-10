// Testet die Reim-Paare. Frisches Browserprofil; App-Timer im Zeitraffer (20×).
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  const gespielt = [];
  folgeAbspielen = (folge) => { gespielt.push(folge.map((q) => q.url)); return Promise.resolve(); };
  const echtTimeout = window.setTimeout;
  const pause = (ms) => new Promise((r) => echtTimeout(r, ms));
  window.setTimeout = (fn, ms = 0, ...a) => echtTimeout(fn, ms / 20, ...a);   // Zeitraffer
  const bis = async (fn, ms = 3000) => { const ende = performance.now() + ms; while (!fn() && performance.now() < ende) await pause(10); return fn(); };
  const offen = () => bis(() => !reim.gesperrt);
  const karten = () => [...document.querySelectorAll('#reime-karten .reim-karte')];
  const tippe = (btn) => { reim.letzterTipp = -1e9; btn.click(); };   // Doppeltipp-Schutz zählt ab Seitenstart
  const karteVon = (w) => karten().find((k) => k.getAttribute('aria-label') === w[1]);

  // 1. Daten: 12 Paare, alle Audio-Dateien vorhanden; Ablenker nie gleicher Vokal oder Anlaut
  pruefe(REIME.length === 12 && REIME.every((p) => p.woerter.length === 2), 'Reim-Daten');
  for (const w of REIME.flatMap((p) => p.woerter)) if (!(await fetch(w[3], { method: 'HEAD' })).ok) fehler.push(`Audio fehlt: ${w[3]}`);
  for (let i = 0; i < 300; i++) {
    const paar = zufall(REIME); const ziel = zufall(paar.woerter);
    const a = reimAblenker(paar, ziel);
    const p2 = REIME.find((p) => p.woerter.includes(a));
    if (p2 === paar || p2.vokal === paar.vokal || reimAnlaut(a[1]) === reimAnlaut(ziel[1])) { fehler.push(`Ablenker ${ziel[1]}/${a[1]}`); break; }
  }
  pruefe(reimAnlaut('Schuh') === 'sch' && reimAnlaut('Schal') === 'sch' && reimAnlaut('Maus') === 'm', 'reimAnlaut');

  // 2. Kachel (nicht im Start-Regal, aber bei allen Spielen) und Vormachen
  pruefe(ALLE_SPIELE.includes('reime') && !START_REGAL.includes('reime'), 'Regal');
  reimStarten();
  pruefe($('#reime').classList.contains('active'), 'Spiel nicht geöffnet');
  pruefe(gespielt[0] && gespielt[0][0] === 'audio/ansage-reim-hoer-mal.wav' && gespielt[0].includes('audio/ansage-reim-das-reimt.wav'), `Vormachen: ${gespielt[0]}`);
  await bis(() => reim.ziel && !reim.gesperrt);

  // 3. Runde: Frage + beide Wörter vorgesprochen; daneben = beide hören, Hinweis, Partner pulsiert; Treffer = Paar + „reimt sich“
  pruefe(gespielt.some((f) => f[0] === 'audio/ansage-reim-frage.wav' && f[1] === reim.ziel[3]), 'Keine Frage');
  pruefe(reim.karten.every((w) => gespielt.some((f) => f.length === 1 && f[0] === w[3])), 'Wörter nicht vorgesprochen');
  const falsch = karten().find((k) => k.getAttribute('aria-label') !== reim.partner[1]);
  tippe(falsch);
  await offen();
  pruefe(reim.runde === 0 && falsch.classList.contains('blass') && karteVon(reim.partner).classList.contains('pulsiert'), 'Daneben');
  pruefe(gespielt.some((f) => f[0] === reim.ziel[3] && f[2] === 'audio/ansage-hoeren-nochmal.wav'), 'Kein „Hör noch mal“');
  for (let i = 0; i < REIM_RUNDEN.length; i++) {
    await offen();
    const stufe = reim.paar.stufe;
    pruefe(stufe === REIM_RUNDEN[i], `Runde ${i + 1}: Stufe ${stufe}`);
    tippe(karteVon(reim.partner));
    await bis(() => reim.runde === i + 1);
    pruefe(gespielt.slice(-1)[0].join() === [reim.ziel[3], reim.partner[3], 'audio/ansage-reim-das-reimt.wav'].join(), 'Treffer-Ansage');
    await bis(() => (reim.ziel && !reim.gesperrt) || $('#reime-jubel').classList.contains('zeigen'), 3000);
  }
  await bis(() => $('#reime .spiel-ende') && !$('#reime .spiel-ende').hidden);
  pruefe($('#reime .spiel-ende') && !$('#reime .spiel-ende').hidden, 'Kein 🏠/🔁 am Ende');

  // 3b. Vorgemachtes Paar nicht als erste Aufgabe; 🔊 rettet auch bei hängendem Ton
  for (let i = 0; i < 20; i++) { reimStarten(); await bis(() => reim.ziel && !reim.gesperrt); if (reim.paar === REIME[0]) { fehler.push('Maus/Haus gleich nach dem Vormachen'); break; } }
  reim.gesperrt = true;   // so tun, als hinge ein Ton
  $('#btn-reime-laut').click();
  await offen();
  pruefe(!reim.gesperrt, '🔊 rettet nicht');

  // 3c. Leichte Stufe „Reime hören“: keine Auswahl, beide Bilder antippen, „Jetzt du!“, 5 Paare
  $('#btn-reime-home').click(); await pause(300);
  await elternOeffnen();
  $('#reim-hoeren').click();
  pruefe(zustand.reimHoeren === true && speicher.lesen('reimHoeren') === true, 'Einstellung „Reime hören“ nicht gespeichert');
  history.back(); await pause(300);
  reimStarten();
  await offen();
  pruefe(karten().length === 1 && $('#reime-ziel .reim-karte') && reim.paar.stufe === 'leicht', 'Hör-Stufe zeigt eine Auswahl');
  pruefe(gespielt.some((f) => f[0] === 'audio/ansage-reim-hoer-mal.wav' && f.includes('audio/ansage-reim-das-reimt.wav')), 'Paar nicht vorgesprochen');
  for (let i = 0; i < REIM_RUNDEN.length; i++) {
    await offen();
    tippe($('#reime-ziel .reim-karte'));
    await offen();
    pruefe(reim.runde === i, 'Schon nach einem Bild weiter');
    tippe(karten()[0]);
    await bis(() => reim.runde === i + 1, 4000);
    pruefe(gespielt.some((f) => f[2] === 'audio/ansage-silben-jetzt-du.wav'), 'Kein „Jetzt du!“');
  }
  await bis(() => $('#reime .spiel-ende') && !$('#reime .spiel-ende').hidden);
  pruefe($('#reime .spiel-ende') && !$('#reime .spiel-ende').hidden, 'Hör-Stufe ohne Ende');
  // Ohne Tipp geht es nach einer Weile zum Mitsprechen weiter
  reimStarten();
  await bis(() => reim.runde === 1, 4000);
  pruefe(reim.runde === 1, 'Ohne Tipp hängt die Hör-Stufe');
  zustand.reimHoeren = false;

  // 4. Home stoppt
  const nr = reim.nummer;
  $('#btn-reime-home').click();
  pruefe(reim.nummer !== nr, 'Home stoppt nicht');
  await pause(300);

  // Ansicht: eine Runde
  window.setTimeout = echtTimeout;
  reimStarten(); reim.runde = 1; reimNeueRunde();
  await pause(800);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'REIM-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
