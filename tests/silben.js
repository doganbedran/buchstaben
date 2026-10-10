// Testet die Silben-Trommel. Frisches Browserprofil; mit oder ohne Silben-Aufnahmen in audio/.
// Alle App-Timer laufen im Zeitraffer (20×), gewartet wird mit bis() auf Zustände statt fester Zeiten.
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
  const anzahl = (url) => gespielt.filter((f) => f[0] === url).length;
  const schlag = () => $('#silben-trommel').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const boegen = () => document.querySelectorAll('#silben-boegen .silben-bogen').length;
  const appBoegen = () => document.querySelectorAll('#silben-boegen-app .silben-bogen').length;
  const schlaege = async (n) => { for (let i = 0; i < n; i++) { silben.letzter = 0; schlag(); } };
  const knopf = () => document.querySelector('.spiel-btn[data-spiel="silben"]');
  const wach = () => bis(() => silben.phase === 'trommeln');
  const aktiv = (id) => $(`#${id}`).classList.contains('active');

  // 1. Sichtbar nur mit Silben-Aufnahmen (nur Bumm zählen hilft nicht beim Silbenhören)
  await silbenPruefen();
  pruefe(knopf().hidden === !silbenGenug(), 'Sichtbarkeit passt nicht zu den vorhandenen Aufnahmen');
  silben.bereit.clear();
  pruefe(!silbenGenug(), 'Ohne Aufnahmen gilt das Spiel als spielbar');
  silben.bereit.add('Maus');
  pruefe(!silbenGenug(), 'Ein Wort reicht nicht für alle Runden');
  // Ab hier: so tun, als wären alle Aufnahmen da
  Object.keys(SILBEN).forEach((w) => silben.bereit.add(w));
  knopf().hidden = !silbenGenug();
  pruefe(!knopf().hidden, 'Spiel bleibt versteckt, obwohl alle Aufnahmen da sind');

  // 2. Wörter und Dateinamen (Umlaute, ß)
  pruefe(Object.keys(SILBEN).every((w) => silbenWoerter().some((x) => x.wort === w)), 'Silben-Wort fehlt im Vorrat');
  [...new Set(SILBEN_RUNDEN)].forEach((n) => pruefe(silbenWoerter(n).length >= 5, `Zu wenige Wörter mit ${n} Silben`));
  pruefe(silbenDatei('Löwe', 1) === 'audio/silbe-loewe-1.wav', `Dateiname: ${silbenDatei('Löwe', 1)}`);
  pruefe(silbenDatei('Käse', 2) === 'audio/silbe-kaese-2.wav', `Dateiname: ${silbenDatei('Käse', 2)}`);
  // Eigenes Foto für das Hauptwort: Wort raus (Bild und Silben könnten nicht zusammenpassen)
  const kVorher = medien.k;
  medien.k = { ...(kVorher || {}), bildUrl: 'blob:x' };
  pruefe(!silbenWoerter().some((w) => w.wort === 'Kuh'), 'Kuh trotz eigenem Foto im Vorrat');
  if (kVorher) medien.k = kVorher; else delete medien.k;

  // 3. Start: Ansage + Wort, in den ersten Runden vormachen, dann wacht die Trommel auf
  knopf().click();
  pruefe(aktiv('silben'), 'Spiel nicht geöffnet');
  pruefe(silben.phase === 'app', `Trommel gleich wach, obwohl die App spricht: ${silben.phase}`);
  await wach();
  pruefe(gespielt[0] && gespielt[0][0] === 'audio/ansage-silben.wav', `Ansage fehlt: ${gespielt[0]}`);
  if (SILBEN_VORMACHEN > 0) pruefe(anzahl('audio/ansage-silben-hoerzu.wav') === 1 && anzahl('audio/ansage-silben-jetzt-du.wav') === 1, 'Kein Vormachen in Runde 1');
  pruefe(appBoegen() === silben.teile.length, `Blaue Vormach-Bögen: ${appBoegen()}`);
  pruefe($('#silben-trommel').classList.contains('wach'), 'Trommel nicht wach');
  pruefe(silben.teile.length === SILBEN_RUNDEN[0], `Runde 1 soll ${SILBEN_RUNDEN[0]} Silben haben`);

  // 4. Zittern / Doppeltipp zählt einmal
  silben.letzter = 0; schlag(); schlag();
  pruefe(boegen() === 1 && silben.schlaege === 1, `Doppeltipp: ${boegen()} Bögen`);
  // 5. Wildes Trommeln: höchstens Silbenzahl + 2 Bögen
  await schlaege(12);
  pruefe(boegen() === silben.teile.length + 2, `Dauertrommeln: ${boegen()} Bögen`);
  clearTimeout(silben.timer);

  // 6. Richtige Zahl → Punkt + Lob
  trommelAufwachen(silben.nummer);
  await schlaege(silben.teile.length);
  await bis(() => silben.runde === 1);
  pruefe(silben.runde === 1, `Runde nicht gezählt: ${silben.runde}`);
  await bis(() => gespielt.some((f) => f[0].includes('lob-')));
  pruefe(gespielt.some((f) => f[0].includes('lob-')), 'Kein Lob');

  // 7. Falsche Zahl: kein Punkt, eigene Bögen bleiben blass stehen, App trommelt vor; zweites Mal gemeinsam
  await bis(() => silben.phase === 'trommeln' && silben.runde === 1);
  pruefe(silben.teile.length === SILBEN_RUNDEN[1], `Runde 2 soll ${SILBEN_RUNDEN[1]} Silben haben`);
  const hoermal = anzahl('audio/ansage-silben-hoermal.wav');
  await schlaege(silben.teile.length + 1);
  await bis(() => anzahl('audio/ansage-silben-hoermal.wav') > hoermal);
  pruefe(document.querySelectorAll('#silben-boegen .silben-bogen.blass').length === silben.teile.length + 1, 'Eigene Bögen nicht blass stehen geblieben');
  await wach();
  pruefe(silben.runde === 1 && silben.versuch === 1, `Nach 1. Fehlversuch: ${silben.runde}/${silben.versuch}`);
  const zusammenGeschafft = anzahl('audio/ansage-silben-zusammen-geschafft.wav');
  await schlaege(silben.teile.length + 1);
  await bis(() => silben.runde === 2);
  pruefe(silben.runde === 2, `Nach 2. Fehlversuch kein Punkt: ${silben.runde}`);
  pruefe(anzahl('audio/ansage-silben-zusammen.wav') === 1, 'Kein „Zusammen“');
  await bis(() => anzahl('audio/ansage-silben-zusammen-geschafft.wav') > zusammenGeschafft);
  pruefe(anzahl('audio/ansage-silben-zusammen-geschafft.wav') === zusammenGeschafft + 1, 'Kein „Zusammen geschafft“');

  // 8. Während die App spricht, zählt kein Schlag
  silben.phase = 'app';
  const vorher = silben.schlaege;
  silben.letzter = 0; schlag();
  pruefe(silben.schlaege === vorher, 'Schlag gezählt, obwohl die App spricht');

  // 9. Home stoppt alles
  const nr = silben.nummer;
  $('#btn-silben-home').click();
  pruefe(silben.nummer !== nr && silben.phase === 'aus', 'Home stoppt nicht');
  await bis(() => aktiv('home'));

  // 10. Erinnerung: Kind trommelt nicht → erst erinnern (wackeln), dann einmal vortrommeln, danach still warten
  knopf().click();
  await wach();
  const erin = anzahl('audio/ansage-silben-erinnerung.wav');
  const jetztDu = anzahl('audio/ansage-silben-jetzt-du.wav');
  await bis(() => silben.erinnert === 1);
  pruefe(silben.erinnert === 1 && anzahl('audio/ansage-silben-erinnerung.wav') === erin + 1, `Keine 1. Erinnerung: ${silben.erinnert}`);
  pruefe($('#silben-trommel').classList.contains('wackeln'), 'Trommel wackelt bei der Erinnerung nicht');
  await bis(() => silben.erinnert === 2 && silben.phase === 'trommeln');
  pruefe(anzahl('audio/ansage-silben-jetzt-du.wav') === jetztDu + 1, 'Nach dem Vortrommeln kein „Jetzt du“');
  pruefe(silben.phase === 'trommeln', `Nach Vortrommeln nicht wieder wach: ${silben.phase}`);
  const rundeErin = silben.runde;
  await pause(1500);   // entspricht 30 s echter Zeit
  pruefe(silben.erinnert === 2 && anzahl('audio/ansage-silben-erinnerung.wav') === erin + 1, 'Erinnert öfter als einmal');
  pruefe(silben.runde === rundeErin && silben.phase === 'trommeln', 'App schaltet ohne Kind selbst weiter');

  // 11. 🔊 während der Trommel-Phase: Versuch beginnt von vorn (ohne Anfangs-Ansage)
  silben.letzter = 0; schlag();
  clearTimeout(silben.timer);
  pruefe(boegen() === 1, 'Vor 🔊 kein Bogen');
  const nrVorWort = silben.nummer, gespieltVorWort = gespielt.length;
  $('#btn-silben-wort').click();
  await wach();
  pruefe(silben.nummer !== nrVorWort && boegen() === 0 && silben.schlaege === 0, `🔊 setzt nicht zurück: ${boegen()}/${silben.schlaege}`);
  pruefe(!gespielt.slice(gespieltVorWort).some((f) => f[0] === 'audio/ansage-silben.wav'), '🔊 spielt die Anfangs-Ansage');
  // … während die App spricht, wirkt 🔊 nicht
  const echtFolge = folgeAbspielen;
  let freigeben = null;
  folgeAbspielen = (folge) => { gespielt.push(folge.map((q) => q.url)); return new Promise((r) => { freigeben = r; }); };
  silbenVorsprechen(false);
  pruefe(silben.phase === 'app', `App spricht, Phase: ${silben.phase}`);
  const nrSprechen = silben.nummer, gespieltSprechen = gespielt.length;
  $('#btn-silben-wort').click();
  $('#silben-bild').click();
  pruefe(silben.nummer === nrSprechen && gespielt.length === gespieltSprechen, '🔊 unterbricht, während die App spricht');
  folgeAbspielen = echtFolge;
  freigeben();
  await wach();
  pruefe(silben.phase === 'trommeln', `Nach dem Sprechen nicht wach: ${silben.phase}`);

  // 12. Zurück-Taste (popstate) stoppt alle Timer; alte Abläufe laufen nicht weiter
  await schlaege(silben.teile.length);   // Auswerte-Timer läuft
  const rundePop = silben.runde, gespieltPop = gespielt.length;
  history.back();
  await bis(() => aktiv('home'));
  pruefe(aktiv('home') && silben.phase === 'aus', `Zurück-Taste: ${silben.phase}`);
  await pause(800);   // > 16 s echte Zeit: Auswerten, Erinnerung, Jubel wären längst dran
  pruefe(silben.runde === rundePop && gespielt.length === gespieltPop, `Nach Zurück läuft noch etwas: Runde ${silben.runde}, ${gespielt.slice(gespieltPop)}`);
  pruefe(aktiv('home'), 'Alter Timer öffnet das Spiel wieder');

  // 13. Ganzes Spiel richtig: Silbenzahlen nach SILBEN_RUNDEN → Jubel → Ende-Knöpfe, kein Weiterspielen von selbst
  const ganzesSpiel = async (falschIn = -1) => {
    const zahlen = [];
    for (let r = 0; r < SILBEN_RUNDEN.length; r++) {
      await bis(() => silben.phase === 'trommeln' && silben.runde === r);
      if (silben.phase !== 'trommeln' || silben.runde !== r) { pruefe(false, `Runde ${r + 1} wacht nicht auf (${silben.phase}/${silben.runde})`); break; }
      zahlen.push(silben.teile.length);
      if (r === falschIn) {   // zweimal daneben → gemeinsam
        await schlaege(silben.teile.length + 1);
        await bis(() => silben.versuch === 1 && silben.phase === 'trommeln');
        await schlaege(silben.teile.length + 1);
      } else await schlaege(silben.teile.length);
      await bis(() => silben.runde === r + 1);
    }
    return zahlen;
  };
  knopf().click();
  const zahlen = await ganzesSpiel();
  pruefe(zahlen.join() === SILBEN_RUNDEN.join(), `Silbenzahlen je Runde: ${zahlen} statt ${SILBEN_RUNDEN}`);
  pruefe(document.querySelectorAll('#silben-runden .voll').length === SILBEN_RUNDEN.length, 'Rundenpunkte nicht voll');
  await bis(() => $('#silben-jubel').classList.contains('zeigen'));
  pruefe($('#silben-jubel').classList.contains('zeigen'), 'Kein Jubel nach allen Runden');
  pruefe(anzahl('audio/ansage-runde-geschafft.wav') >= 1, 'Keine Ansage „geschafft“');
  const ende = () => $('#silben .spiel-ende');
  await bis(() => ende() && !ende().hidden);
  pruefe(ende() && !ende().hidden, 'Keine Ende-Knöpfe (Haus/Nochmal)');
  const nrEnde = silben.nummer;
  await pause(500);   // 10 s echte Zeit
  pruefe(silben.nummer === nrEnde && silben.runde === SILBEN_RUNDEN.length, 'Spiel läuft nach dem Ende von selbst weiter');
  if (ende()) {
    const eb = ende().getBoundingClientRect();
    pruefe(eb.bottom <= innerHeight + 1 && ende().querySelector('.ende-home').getBoundingClientRect().width >= 80, 'Ende-Knöpfe nicht gut sichtbar');
  }

  // 14. Nochmal: neues Spiel; Fehlrunde mit 1 Silbe → nächste Runde nicht schwerer
  ende().querySelector('.ende-nochmal').click();
  pruefe(ende().hidden && !$('#silben-jubel').classList.contains('zeigen') && silben.runde === 0, 'Nochmal startet kein neues Spiel');
  const einsilbig = SILBEN_RUNDEN.findIndex((n, i) => i + 1 < SILBEN_RUNDEN.length && SILBEN_RUNDEN[i + 1] > n);
  const zahlen2 = await ganzesSpiel(einsilbig);
  if (einsilbig >= 0) pruefe(zahlen2[einsilbig + 1] === zahlen2[einsilbig], `Nach „zusammen“ schwerer geworden: ${zahlen2}`);
  await bis(() => ende() && !ende().hidden);
  // 15. Haus am Ende führt zur Startseite
  ende().querySelector('.ende-home').click();
  await bis(() => aktiv('home'));
  pruefe(aktiv('home') && silben.phase === 'aus', 'Haus am Ende führt nicht nach Hause');

  // 15b. Zu zweit trommeln: zwei Trommeln, Schläge beider zählen, Bögen in der Farbe der Trommel, Vormachen abwechselnd
  knopf().click();
  await wach();
  pruefe(!$('#btn-silben-zwei'), '👫-Knopf noch auf der Trommel-Seite (sollte nur im Elternbereich sein)');
  zuZweitSetzen(true);
  pruefe(!$('#silben-trommel-2').hidden && silben.zuZweit && speicher.lesen('zuZweit') === true, 'Zweite Trommel fehlt');
  silben.letzter = 0; $('#silben-trommel').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  silben.letzter = 0; $('#silben-trommel-2').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  pruefe(silben.schlaege === 2 && document.querySelectorAll('#silben-boegen .silben-bogen.zweite').length === 1, 'Zu zweit: Schläge/Bögen');
  clearTimeout(silben.timer);
  const r1 = $('#silben-trommel').getBoundingClientRect(); const r2 = $('#silben-trommel-2').getBoundingClientRect();
  pruefe(r1.right <= r2.left && r2.right <= innerWidth && r1.left >= 0, 'Trommeln überlappen oder ragen heraus');
  await vortrommeln(silben.nummer, { takt: 10 });
  pruefe($('#silben-trommel-2').classList.contains('schlag') || silben.teile.length < 2, 'Vormachen nicht abwechselnd');
  zuZweitSetzen(false);
  pruefe($('#silben-trommel-2').hidden && !silben.zuZweit, 'Zurück zu einer Trommel');
  $('#btn-silben-home').click(); await bis(() => aktiv('home'));

  // Ansicht: neues Spiel, Kind hat in Runde 1 zweimal getrommelt
  knopf().click();
  await wach();
  await schlaege(2);
  clearTimeout(silben.timer); clearTimeout(silben.erinnerTimer);
  window.setTimeout = echtTimeout;
  // 16. Nichts überlappt, alles im Bild – auch mit 5 eigenen + 3 blauen Bögen
  const kasten = (sel) => $(sel).getBoundingClientRect();
  const teile = { kopf: '#silben .topbar', bild: '#silben-bild', boegen: '.silben-reihen', trommel: '#silben-trommel' };
  const ueber = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const layout = (wann) => {
    const r = Object.fromEntries(Object.entries(teile).map(([k, sel]) => [k, kasten(sel)]));
    const namen = Object.keys(r);
    namen.forEach((a, i) => namen.slice(i + 1).forEach((b) => pruefe(!ueber(r[a], r[b]), `${wann}: Überlappung ${a}/${b}`)));
    namen.forEach((k) => pruefe(r[k].left >= 0 && r[k].top >= 0 && r[k].right <= innerWidth + 1 && r[k].bottom <= innerHeight + 1,
      `${wann}: ${k} ragt aus dem Bild (${Math.round(r[k].left)},${Math.round(r[k].top)}–${Math.round(r[k].right)},${Math.round(r[k].bottom)})`));
    pruefe(r.trommel.width >= 200, `Trommel zu klein: ${Math.round(r.trommel.width)} px`);
  };
  layout('2 Bögen');
  const extra = [...[1, 2, 3].map(() => bogenHinzu('#silben-boegen')), ...[1, 2, 3].map(() => bogenHinzu('#silben-boegen-app', true))];
  layout('5+3 Bögen');
  pruefe($('#silben-boegen').scrollWidth <= innerWidth, `5 Bögen breiter als der Bildschirm: ${$('#silben-boegen').scrollWidth} px`);
  extra.forEach((b) => b.remove());

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? `FEHLER (${innerWidth}×${innerHeight}): ` + fehler.join(' | ')
    : `SILBEN-TESTS OK (${Object.keys(SILBEN).length} Wörter, ${innerWidth}×${innerHeight})`;
  document.body.appendChild(d);
})().catch((e) => {
  window.setTimeout = window.setTimeout;
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;left:0;right:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
