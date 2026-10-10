// Testet die Wörterkiste. Frisches Browserprofil; App-Timer im Zeitraffer (20×).
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
  const offen = () => bis(() => !kiste.gesperrt);
  const karten = () => [...document.querySelectorAll('#kiste-karten .zeigen-karte')];
  const tippe = (btn) => { kiste.letzterTipp = -1e9; btn.click(); };   // Doppeltipp-Schutz zählt ab Seitenstart
  const karteVon = (id) => karten().find((k) => k.getAttribute('aria-label') === kisteText(id));

  // 1. Daten: 5 Kisten × 6 Wörter, alle mit Artikel, Tierlaute für alle Bauernhof-Wörter
  pruefe(KISTEN.length === 5 && KISTEN.every((k) => k.name && k.beispiel && k.woerter.length === 6 && k.woerter.every((w) => w[3] && w[3].endsWith('?'))), 'Kisten-Daten');
  pruefe(KISTEN.every((k) => k.woerter.every((w) => /^(der|die|das) /.test(w[1]))), 'Wort ohne Artikel');
  pruefe(KISTEN.find((k) => k.id === 'bauernhof').woerter.every((w) => TIERLAUTE[w[0]]), 'Tierlaut fehlt');
  // Auswahl: 3 Wörter, nie zu ähnliche zusammen, beim nächsten Mal die anderen zuerst
  const bad = KISTEN.find((k) => k.id === 'bad');
  for (let i = 0; i < 200; i++) {
    const w = kisteAuswahl(bad);
    if (w.length !== 3 || (w.includes('badewanne') && w.includes('dusche'))) { fehler.push(`Auswahl: ${w}`); break; }
  }
  const koerper = KISTEN[0];
  const erste = kisteAuswahl(koerper);
  const zweite = kisteAuswahl(koerper);
  pruefe(!erste.some((id) => zweite.includes(id)), `Zweite Runde wiederholt: ${erste} / ${zweite}`);

  // 2. Kachel im Start-Regal, Kisten-Wahl mit 5 Kacheln
  pruefe(START_REGAL.includes('kiste') && !document.querySelector('.spiel-btn[data-spiel="kiste"]').hidden, 'Kachel fehlt');
  document.querySelector('.spiel-btn[data-spiel="kiste"]').click();
  pruefe($('#kiste').classList.contains('active') && document.querySelectorAll('#kiste-wahl .spiel-btn').length === 5, 'Kisten-Wahl');

  // 3. Eine Frühstücks-Runde komplett: Das ist / Wo ist / Was ist das / bei dir / Erzähl-Bild
  document.querySelectorAll('#kiste-wahl .spiel-btn')[1].click();
  await offen();
  pruefe(kiste.kiste.id === 'fruehstueck' && kiste.stufe === 0 && karten().length === 1, 'Stufe 1');
  pruefe(gespielt.some((f) => f[0] === 'audio/ansage-zeigen-das-ist.wav' && f[1].startsWith('audio/kiste-')), 'Keine Ansage „Das ist“ + Wort');
  for (let i = 0; i < 3; i++) { await offen(); tippe(karten()[0]); await bis(() => kiste.schritt === i + 1 || kiste.stufe === 1); }
  await bis(() => kiste.stufe === 1 && karten().length === 3);
  pruefe(document.querySelectorAll('#kiste-ablage .voll').length === 3 || $('#kiste-ablage').hidden, 'Ablage');
  // Daneben: Bild benennen, nochmal fragen, kein Punkt
  await offen();
  const vorher = kiste.punkte;
  const falsch = karten().find((k) => k.getAttribute('aria-label') !== kisteText(kiste.ziel));
  tippe(falsch);
  pruefe(kiste.punkte === vorher, 'Punkt trotz Daneben');
  await offen();
  pruefe(gespielt.slice(-1)[0][0] === 'audio/ansage-kiste-wo-ist.wav', 'Nicht nochmal gefragt');
  for (let i = 0; i < 6; i++) { await offen(); tippe(karteVon(kiste.ziel)); await bis(() => kiste.schritt === i + 1 || kiste.stufe === 2); }
  pruefe(kiste.stufe === 2, `Stufe 3 nicht erreicht: ${kiste.stufe}`);
  for (let i = 0; i < 3; i++) { await offen(); tippe(karten()[0]); await bis(() => kiste.schritt === i + 1 || kiste.stufe === 3); }
  await bis(() => kiste.stufe === 3 && !$('#btn-kiste-daumen').hidden);
  pruefe(gespielt.some((f) => f[0] === 'audio/ansage-kiste-wo-ist-bei-dir.wav'), 'Keine Frage „Wo ist bei dir“');
  // Tipp aufs Bild zählt wie 👍 (und hängt nicht)
  tippe(karten()[0]);
  await bis(() => !$('#kiste-erzaehlen').hidden);
  pruefe($('#btn-kiste-daumen').hidden && $('#btn-kiste-laut').hidden, 'Daumen/🔊 nach dem Ende sichtbar');
  pruefe(!$('#kiste-erzaehlen').hidden && document.querySelectorAll('#kiste-fragen li').length === 3, 'Erzähl-Bild fehlt');
  pruefe(kiste.woerter.every((id) => $('#kiste-fragen').textContent.includes(kisteWort(id)[3])), 'Fragen passen nicht zu den Wörtern');
  pruefe($('#kiste-beispiel').textContent === kiste.kiste.beispiel, 'Beispiel fehlt');
  pruefe(!$('#kiste .spiel-ende') || $('#kiste .spiel-ende').hidden, '🏠/🔁 kommen zu früh');
  pruefe(kiste.punkte === kistePunkteGesamt(), `Punkte ${kiste.punkte}/${kistePunkteGesamt()}`);
  // Erzählen: Aufnahme des Kindes wird gespeichert (eine je Runde) und erscheint im Album
  pruefe($('#btn-kiste-erzaehlen').hidden, '🎙️ sichtbar, obwohl das Mikrofon nicht erlaubt ist (Browser-Frage vor dem Kind)');
  const ton = new Blob(['x'], { type: 'audio/webm' });
  await kisteErzaehlungGesetzt(ton);
  await kisteErzaehlungGesetzt(ton);   // nochmal aufnehmen ersetzt
  const erz = (zustand.funde || []).filter((f) => f.art === 'erzaehlung');
  pruefe(erz.length === 1 && erz[0].kiste === 'fruehstueck' && erz[0].woerter.length === 3, `Erzählungen: ${JSON.stringify(erz)}`);
  pruefe((await datenbank.medienVon(`fund-${fundBesitzer()}`)).some((m) => m.schluessel === `fund-${fundBesitzer()}|${erz[0].id}|stimme`), 'Erzählung nicht gespeichert');
  albumZeichnen(await fundMedienLaden());
  pruefe(document.querySelectorAll('#album-raster .sticker.erzaehlung').length === 1, 'Erzählung nicht im Album');
  await bis(() => $('#kiste .spiel-ende') && !$('#kiste .spiel-ende').hidden);
  pruefe($('#kiste .spiel-ende') && !$('#kiste .spiel-ende').hidden, 'Kein 🏠/🔁');

  // 4. Bauernhof: Stufe 4 = „Wie macht …?“ mit Tierlaut, ohne Daumen
  kisteNeu(KISTEN.find((k) => k.id === 'bauernhof'));
  kiste.stufe = 2; kiste.schritt = 2; kiste.auftraege = kiste.woerter.slice();
  kisteWeiter(kiste.nummer);
  await bis(() => !$('#kiste-erzaehlen').hidden, 4000);
  pruefe(gespielt.some((f) => f[0] === 'audio/ansage-kiste-wie-macht.wav') && gespielt.some((f) => f[0].startsWith('audio/tier-')), 'Tierlaut-Stufe');
  // 4b. 🔊 während des Stufenwechsels richtet nichts an; Daumen bleibt nach Abbruch nicht stehen
  kisteNeu(KISTEN[1]);
  kiste.stufe = 0; kiste.schritt = 2;
  kisteWeiter(kiste.nummer);
  $('#btn-kiste-laut').click();
  await bis(() => kiste.stufe === 1 && karten().length === 3);
  pruefe(kiste.stufe === 1 && kiste.ziel && karten().length === 3, '🔊 im Wechsel');
  kiste.stufe = 2; kiste.schritt = 2; kiste.auftraege = kiste.woerter.slice();
  kisteWeiter(kiste.nummer);
  await bis(() => !$('#btn-kiste-daumen').hidden);
  kistenWahlZeigen();
  kisteNeu(KISTEN[1]);
  pruefe($('#btn-kiste-daumen').hidden, 'Daumen bleibt nach Abbruch stehen');
  // 4c. Zwei Fehlversuche: gesuchtes Bild pulsiert
  kiste.stufe = 0; kiste.schritt = 2; kisteWeiter(kiste.nummer);
  await bis(() => kiste.stufe === 1 && !kiste.gesperrt);
  for (let i = 0; i < 2; i++) {
    await offen();
    tippe(karten().find((k) => k.getAttribute('aria-label') !== kisteText(kiste.ziel)));
    await bis(() => !kiste.gesperrt);
  }
  pruefe(karteVon(kiste.ziel).classList.contains('pulsiert'), 'Kein Hinweis nach zwei Fehlversuchen');

  // 5. Straße: keine Stufe 4
  kisteNeu(KISTEN.find((k) => k.id === 'strasse'));
  pruefe(kistePunkteGesamt() === 12, 'Straße mit Stufe 4');

  // 6. Home stoppt
  const nr = kiste.nummer;
  $('#btn-kiste-home').click();
  pruefe(kiste.nummer !== nr, 'Home stoppt nicht');
  await pause(300);

  // Ansicht: Stufe 2 der Bad-Kiste
  window.setTimeout = echtTimeout;
  document.querySelector('.spiel-btn[data-spiel="kiste"]').click();
  kisteNeu(bad);
  kiste.stufe = 0; kiste.schritt = 2; kiste.punkte = 2;
  kisteWeiter(kiste.nummer);
  await pause(1200);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'KISTEN-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
