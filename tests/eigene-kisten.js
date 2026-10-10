// Testet die eigenen Kisten (Meine Leute, Meine Kita): Anlegen im Elternbereich, erst ab 3 fertigen Wörtern im Spiel,
// eigene Fotos/Aufnahmen in der Lektion, „Wer ist das?“, Sicherung. Frisches Browserprofil; App-Timer im Zeitraffer (20×).
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
  const tippe = (btn) => { kiste.letzterTipp = -1e9; btn.click(); };
  const karteVon = (id) => karten().find((k) => k.getAttribute('aria-label') === kisteText(id));
  const bild = await new Promise((r) => { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#e8a33d'; g.fillRect(0, 0, 8, 8); c.toBlob(r, 'image/png'); });
  const ton = new Blob(['x'], { type: 'audio/webm' });

  // 1. Profil mit Leuten (3 fertig + 1 ohne Foto) und Kita (2 fertig)
  const leute = [['oma1', 'Oma'], ['opa1', 'Opa'], ['tante1', 'Tante Anna'], ['onkel1', 'Onkel Ben']];
  const kita = [['rutsche1', 'die Rutsche'], ['garderobe1', 'die Garderobe']];
  await datenbank.profilSpeichern({ id: 'p-fam', name: 'Familie', erstellt: 1, woerter: [],
    kistenWoerter: [...leute.map(([id, wort]) => ({ id, kiste: 'leute', wort })), ...kita.map(([id, wort]) => ({ id, kiste: 'kita', wort }))] });
  for (const [id] of [...leute.slice(0, 3), ...kita]) await datenbank.medienSetzen('p-fam', `w-${id}`, 'bild', bild);
  for (const [id] of [...leute, ...kita]) await datenbank.medienSetzen('p-fam', `w-${id}`, 'stimme', ton);
  await profilAktivieren('p-fam');
  pruefe(spielbareKisten().length === KISTEN.length + 1, `Spielbare Kisten: ${spielbareKisten().map((k) => k.id)}`);
  pruefe(eigeneKiste(EIGENE_KISTEN[0]).woerter.length === 3, 'Wort ohne Foto ist im Spiel');

  // 2. Elternbereich: Kisten-Abschnitt mit Stand, ➕ legt ein Wort an
  await elternOeffnen();
  const teil = (id) => document.querySelector(`.eigene-kiste[data-kiste="${id}"]`);
  pruefe(teil('leute') && teil('leute').textContent.includes('im Spiel'), 'Leute nicht „im Spiel“');
  pruefe(teil('kita') && teil('kita').textContent.includes('2 von 3'), 'Kita-Stand fehlt');
  pruefe(teil('kita').textContent.includes('keine anderen Kinder'), 'Kita-Hinweis fehlt');
  
  pruefe(teil('leute').textContent.includes('Foto fehlt'), 'Fehlendes Foto nicht angezeigt');
  window.prompt = () => 'die Oma';
  [...teil('leute').querySelectorAll('button')].find((b) => b.textContent.startsWith('➕')).click();
  await bis(() => eigeneKistenWoerter.length === 5);
  pruefe(eigeneKistenWoerter.some((w) => w.kiste === 'leute' && w.wort === 'Oma'), 'Artikel beim Namen nicht entfernt');
  window.prompt = () => 'der Sandkasten';
  [...teil('kita').querySelectorAll('button')].find((b) => b.textContent.startsWith('➕')).click();
  await bis(() => eigeneKistenWoerter.length === 8);
  pruefe(eigeneKistenWoerter.some((w) => w.kiste === 'kita' && w.wort === 'der Sandkasten'), 'Neues Kita-Wort fehlt');
  await bis(() => teil('kita') && teil('kita').querySelectorAll('.eigenes-wort').length === 3);
  pruefe(teil('kita').querySelectorAll('.eigenes-wort').length === 3, 'Neue Zeile fehlt');
  history.back(); await pause(300);
  // Kita mit dem neuen Wort fertig machen → beide eigenen Kisten im Spiel (7 Kacheln)
  const sand = eigeneKistenWoerter.find((w) => w.wort === 'der Sandkasten');
  await datenbank.medienSetzen('p-fam', `w-${sand.id}`, 'bild', bild);
  await datenbank.medienSetzen('p-fam', `w-${sand.id}`, 'stimme', ton);
  await medienLaden();

  // Gelöschtes Wort aus der letzten Runde darf nicht mehr gewählt werden (sonst hängt die Lektion)
  const leuteKiste = eigeneKiste(EIGENE_KISTEN[0]);
  for (let i = 0; i < 50; i++) {
    kiste.zuletzt.leute = ['weg1', 'opa1', 'tante1'];
    const w = kisteAuswahl(leuteKiste);
    if (w.length !== 3 || !w.every((id) => leuteKiste.woerter.some((x) => x[0] === id))) { fehler.push(`Auswahl mit gelöschtem Wort: ${w}`); break; }
  }

  // 3. Kisten-Wahl zeigt „Meine Leute“ mit eigenem Foto; Runde mit eigenen Aufnahmen und „Wer ist das?“
  kisteStarten();
  const wahl = [...document.querySelectorAll('#kiste-wahl .spiel-btn')];
  pruefe(wahl.length === KISTEN.length + 2, `Kisten-Wahl: ${wahl.length}`);
  wahl.forEach((b) => {
    const r = b.getBoundingClientRect();
    pruefe(r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && r.width >= 90, `Kachel ragt heraus/zu klein: ${b.getAttribute('aria-label')} ${Math.round(r.width)}`);
  });
  const leuteBtn = wahl.find((b) => b.getAttribute('aria-label') === 'Meine Leute');
  pruefe(leuteBtn && leuteBtn.querySelector('img.kiste-foto'), 'Kein Foto auf der Leute-Kachel');
  leuteBtn.click();
  await offen();
  pruefe(kiste.kiste.id === 'leute' && kiste.woerter.every((id) => ['oma1', 'opa1', 'tante1'].includes(id)), `Wörter: ${kiste.woerter}`);
  pruefe(karten()[0].querySelector('img.kiste-foto'), 'Kein eigenes Foto in der Lektion');
  pruefe(gespielt.some((f) => f[0] === 'audio/ansage-zeigen-das-ist.wav' && f[1].startsWith('blob:')), 'Nicht die eigene Aufnahme');
  for (let i = 0; i < 3; i++) { await offen(); tippe(karten()[0]); await bis(() => kiste.schritt === i + 1 || kiste.stufe === 1); }
  for (let i = 0; i < 6; i++) { await offen(); tippe(karteVon(kiste.ziel)); await bis(() => kiste.schritt === i + 1 || kiste.stufe === 2); }
  pruefe(kiste.stufe === 2, `Stufe 3 nicht erreicht: ${kiste.stufe}`);
  await bis(() => gespielt.some((f) => f[0] === 'audio/ansage-kiste-wer-ist-das.wav'));
  pruefe(gespielt.some((f) => f[0] === 'audio/ansage-kiste-wer-ist-das.wav'), 'Keine Frage „Wer ist das?“');
  pruefe(!gespielt.some((f) => f[0] === 'audio/ansage-zeigen-was-ist-das.wav'), '„Was ist das?“ bei Menschen');
  for (let i = 0; i < 3; i++) { await offen(); tippe(karten()[0]); await bis(() => kiste.schritt === i + 1 || !$('#kiste-erzaehlen').hidden); }
  await bis(() => !$('#kiste-erzaehlen').hidden);
  pruefe(!$('#kiste-erzaehlen').hidden, 'Kein Erzähl-Bild (ohne „bei dir“)');
  pruefe(!gespielt.some((f) => f[0] === 'audio/ansage-kiste-wo-ist-bei-dir.wav'), '„Wo ist bei dir“ bei Menschen');
  pruefe(/(Tante Anna|Oma|Opa)/.test($('#kiste-fragen').textContent), 'Frage mit Namen fehlt');
  pruefe(kiste.punkte === kistePunkteGesamt(), `Punkte ${kiste.punkte}/${kistePunkteGesamt()}`);
  await kisteErzaehlungGesetzt(ton);
  const erz = zustand.funde.filter((f) => f.art === 'erzaehlung');
  albumZeichnen(await fundMedienLaden());
  pruefe(document.querySelector('#album-raster .sticker.erzaehlung img.kiste-foto'), 'Erzählung im Album ohne Fotos');
  // Erzählung mit inzwischen gelöschten Wörtern: Kisten-Symbol statt leerer Kachel
  zustand.funde = [...zustand.funde, { id: 'ealt', art: 'erzaehlung', kiste: 'leute', woerter: ['weg1', 'weg2', 'weg3'], zeit: 1 }];
  await datenbank.medienSetzen(`fund-${fundBesitzer()}`, 'ealt', 'stimme', ton);
  albumZeichnen(await fundMedienLaden());
  pruefe([...document.querySelectorAll('#album-raster .sticker.erzaehlung span')].every((x) => x.textContent || x.querySelector('img')), 'Leere Erzählung im Album');
  zustand.funde = zustand.funde.filter((x) => x.id !== 'ealt');
  kisteStoppen();

  // 4. Sicherung: Kisten-Wörter und Erzählung bleiben, Fremdes fällt heraus
  const p = profilSauber({ id: 'p-x', name: 'x', kistenWoerter: [{ id: 'a1', kiste: 'leute', wort: 'Oma' },
    { id: 'b<x', kiste: 'leute', wort: 'x' }, { id: 'c1', kiste: 'boese', wort: 'x' }, { id: 'd1', kiste: 'kita', wort: 5 }] });
  pruefe(p.kistenWoerter.length === 1 && p.kistenWoerter[0].wort === 'Oma', `Sicherung Kisten-Wörter: ${JSON.stringify(p.kistenWoerter)}`);
  const f = fundeSauber(erz)[0];
  pruefe(f && f.kiste === 'leute' && f.woerter.length === 3, `Sicherung Erzählung: ${JSON.stringify(f)}`);
  const s = await sicherungErstellen();
  pruefe(s.profile.find((x) => x.id === 'p-fam').kistenWoerter.length === 8, 'Kisten-Wörter fehlen in der Sicherung');

  // 5. Standard-Profil: keine eigenen Kisten
  await profilAktivieren(STANDARD.id);
  pruefe(spielbareKisten().length === KISTEN.length, 'Eigene Kisten im Standard-Profil');

  // Ansicht: Elternbereich mit den eigenen Kisten
  await profilAktivieren('p-fam');
  await elternOeffnen();
  document.querySelector('.eigene-kisten').scrollIntoView();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'EIGENE KISTEN OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
