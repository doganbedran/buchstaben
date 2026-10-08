// Testet Kinder: Übernahme alter Sterne, getrennte Sterne/Schrift/Profile, Löschen.
// In einem frischen Browserprofil öffnen. Ansicht am Ende per #wer, #home, #kind, #eltern.
(async function () {
  const fehler = [];
  const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };
  const bis = async (fn, ms = 4000) => {
    const ende = Date.now() + ms;
    while (!fn() && Date.now() < ende) await new Promise((r) => setTimeout(r, 30));
    return fn();
  };
  await startFertig;
  window.confirm = () => true;

  pruefe($('#home').classList.contains('active'), 'Ohne Kinder sollte die Startseite kommen');
  pruefe($('#btn-kind').hidden, 'Ohne Kinder kein Kind-Knopf');

  // 1. Erstes Kind übernimmt alte Sterne und Schrift
  window.prompt = () => 'Lina';
  $('#btn-kind-neu').click();
  await bis(() => kinder.length === 1 && $('#kind').classList.contains('active'));
  const lina = kinder[0];
  pruefe(lina && lina.sterne.a === 2, 'Lina hat die alten Sterne nicht');
  pruefe(lina && lina.schreibweise === 'gross', 'Lina hat die alte Schrift nicht');
  pruefe(JSON.stringify(speicher.lesen('sterne', {})) === '{}', 'Alte Sterne nicht geleert');
  pruefe(zustand.kind === lina.id, 'Erstes Kind nicht aktiv');

  // 2. Zweites Kind startet leer, mit anderem Tier
  history.back();
  await bis(() => $('#eltern').classList.contains('active'));
  window.prompt = () => 'Emil';
  $('#btn-kind-neu').click();
  await bis(() => kinder.length === 2);
  const emil = kinder.find((k) => k.name === 'Emil');
  pruefe(emil && JSON.stringify(emil.sterne) === '{}', 'Emil sollte keine Sterne haben');
  pruefe(emil && emil.tier !== lina.tier, 'Emil hat dasselbe Tier wie Lina');
  history.back();
  await bis(() => $('#eltern').classList.contains('active'));

  // 3. Sterne getrennt
  await kindWaehlen(emil.id);
  zustand.index = BUCHSTABEN.findIndex((e) => e.b === 'b');
  tafelZustand.breite = 100; tafelZustand.hoehe = 100;
  geschafft();
  await new Promise((r) => setTimeout(r, 200));
  const ausDb = await datenbank.kinder();
  pruefe(ausDb.find((k) => k.id === emil.id).sterne.b === 1, 'Emils Stern nicht gespeichert');
  pruefe(!ausDb.find((k) => k.id === lina.id).sterne.b, 'Lina hat Emils Stern bekommen');
  pruefe(ausDb.find((k) => k.id === lina.id).sterne.a === 2, 'Linas Sterne verändert');

  // 4. Schrift getrennt
  await kindWaehlen(lina.id);
  pruefe(zeichen(BUCHSTABEN[0]) === 'A', 'Lina sollte große Buchstaben haben');
  await kindWaehlen(emil.id);
  pruefe(zeichen(BUCHSTABEN[0]) === 'a', 'Emil sollte kleine Buchstaben haben');

  // 4b. Name im Lob: nur wenn aufgenommen, Reihenfolge Lob -> Name -> Wort, jedes Kind seinen eigenen
  const apfel = BUCHSTABEN[0];
  const folgeText = (f) => f.map((q) => (q.name ? 'NAME' : q.url.startsWith('blob:') ? 'eigen' : q.url.replace('audio/', ''))).join(' > ');
  const ohneName = wiedergabeFolge(apfel, true, kinder.find((k) => k.id === lina.id));
  pruefe(ohneName.length === 2 && !ohneName.some((q) => q.name), `Ohne Namensaufnahme kein Name: ${folgeText(ohneName)}`);
  kindBearbeiten(lina.id);
  await kindAendern((k) => { k.nameStimme = new Blob(['lina'], { type: 'audio/webm' }); });
  history.back();
  await bis(() => $('#eltern').classList.contains('active'));
  const linaNeu = kinder.find((k) => k.id === lina.id);
  const mitName = wiedergabeFolge(apfel, true, linaNeu);
  pruefe(mitName.length === 3 && mitName[1].name && /^lob-\d\.wav$/.test(mitName[0].url.replace('audio/', ''))
    && mitName[2].url.endsWith('a-wort.wav'), `Lob mit Name falsch: ${folgeText(mitName)}`);
  pruefe(!wiedergabeFolge(apfel, false, linaNeu).some((q) => q.name), 'Laut ohne Lob sollte keinen Namen haben');
  pruefe(!wiedergabeFolge(apfel, true, kinder.find((k) => k.id === emil.id)).some((q) => q.name), 'Emil hört Linas Namen');
  pruefe(!wiedergabeFolge(apfel, true, null).some((q) => q.name), 'Ohne Kind sollte kein Name kommen');
  pruefe((await datenbank.kinder()).find((k) => k.id === lina.id).nameStimme instanceof Blob, 'Namensaufnahme nicht gespeichert');

  // 5. Profil pro Kind
  window.prompt = () => 'Papa';
  await profilNeu();
  const papa = (await datenbank.profile()).find((p) => p.name === 'Papa');
  await datenbank.medienSetzen(papa.id, 'a', 'bild', await fotoVerkleinern(await new Promise((r) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#3d8fd1'; g.fillRect(0, 0, 64, 64); c.toBlob(r);
  })));
  kindBearbeiten(emil.id);
  await kindAendern((k) => { k.profil = papa.id; });
  history.back();
  await bis(() => $('#eltern').classList.contains('active'));
  await kindWaehlen(emil.id);
  pruefe(zustand.profil === papa.id && bildHtml(BUCHSTABEN[0]).includes('blob:'), 'Emil sieht Papas Foto nicht');
  await kindWaehlen(lina.id);
  pruefe(zustand.profil === 'standard' && bildHtml(BUCHSTABEN[0]) === '🍎', 'Lina sollte Standard sehen');

  // 6. Elternbereich verlassen stellt das Profil des Kindes wieder her
  await profilAktivieren(papa.id);          // im Elternbereich zum Bearbeiten gewählt
  await elternVerlassen();
  pruefe(zustand.profil === 'standard', 'Nach dem Elternbereich hat Lina nicht wieder Standard');

  // 7. Profil löschen -> Emil fällt auf Standard zurück
  await profilAktivieren(papa.id);
  $('#btn-profil-loeschen').click();
  await new Promise((r) => setTimeout(r, 600));
  pruefe((await datenbank.kinder()).find((k) => k.id === emil.id).profil === 'standard', 'Emil nach Profil-Löschen nicht auf Standard');

  // 8. Kind löschen -> andere bleiben
  window.prompt = () => 'Weg';
  $('#btn-kind-neu').click();
  await bis(() => kinder.length === 3 && $('#kind').classList.contains('active'));
  $('#btn-kind-loeschen').click();
  await bis(() => kinder.length === 2 && $('#eltern').classList.contains('active'));
  pruefe(kinder.length === 2 && !kinder.some((k) => k.name === 'Weg'), 'Kind löschen fehlgeschlagen');

  // Ansicht für den Screenshot
  await elternVerlassen();
  const ansicht = location.hash.slice(1) || 'wer';
  if (ansicht === 'wer') { werZeichnen(); zeigen('wer', false); }
  if (ansicht === 'home') { await kindWaehlen(emil.id); rasterZeichnen(); zeigen('home', false); }
  if (ansicht === 'kind') kindBearbeiten(lina.id);
  if (ansicht === 'eltern') await elternOeffnen();

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'KINDER-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
