// Testet das Sticker-Album. Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  await startFertig;
  window.confirm = () => true;
  // Abgespielte Folgen mitschneiden statt abspielen
  const gespielt = [];
  folgeAbspielen = (folge) => { gespielt.push(folge.map((q) => q.url)); return Promise.resolve(); };

  const m = BUCHSTABEN.find((e) => e.b === 'm');
  const erfolg = async (e, wahl) => {
    zustand.index = BUCHSTABEN.indexOf(e);
    zustand.wahl = wahl;
    gespielt.length = 0;
    geschafft();
    clearTimeout(tafelZustand.jubelTimer);
    await warte(650);
    return gespielt[gespielt.length - 1] || [];
  };

  // 1. Ohne Kinder: erster Erfolg -> neuer Sticker mit Ansage, zweiter nicht
  const maus = hauptWahl(m);
  let folge = await erfolg(m, maus);
  pruefe(zustand.album.includes('m|Maus'), 'Sticker Maus fehlt');
  pruefe(folge[folge.length - 1] === 'audio/ansage-sticker.wav', `Keine Sticker-Ansage: ${folge}`);
  pruefe($('#jubel').classList.contains('mit-sticker'), 'Kein Sticker-Abzeichen im Jubel');
  folge = await erfolg(m, maus);
  pruefe(zustand.album.filter((k) => k === 'm|Maus').length === 1, 'Sticker doppelt');
  pruefe(!folge.includes('audio/ansage-sticker.wav'), 'Ansage beim zweiten Mal');
  const mond = woerterFuer(m).find((w) => w.wort === 'Mond');
  await erfolg(m, mond);
  pruefe(zustand.album.includes('m|Mond'), 'Sticker Mond fehlt');
  pruefe(JSON.stringify(speicher.lesen('album', [])) === JSON.stringify(['m|Maus', 'm|Mond']), 'Album nicht gespeichert');

  // 2. Album-Ansicht
  document.querySelector('.spiel-btn[data-spiel="album"]').click();
  await warte(300);   // Album lädt zuerst die Fotos der Buchstaben-Jagd
  const gesamt = alleSticker().length;
  pruefe($('#album').classList.contains('active'), 'Album nicht geöffnet');
  pruefe($('#album-zahl').textContent === `2 / ${gesamt}`, `Zähler: ${$('#album-zahl').textContent}`);
  pruefe(document.querySelectorAll('.sticker.hat').length === 2 && document.querySelectorAll('.sticker').length === gesamt, 'Sticker-Anzeige falsch');
  pruefe(gesamt === BUCHSTABEN.reduce((s, e) => s + 1 + e.mehr.length, 0), `Anzahl Sticker ${gesamt}`);

  // 3. Erstes Kind übernimmt das Album, zweites Kind hat ein eigenes
  window.prompt = () => 'Lina';
  $('#btn-kind-neu').click();
  await warte(400);
  window.prompt = () => 'Emil';
  $('#btn-kind-neu').click();
  await warte(400);
  const lina = kinder.find((k) => k.name === 'Lina'), emil = kinder.find((k) => k.name === 'Emil');
  pruefe(lina && lina.album && lina.album.length === 2, 'Lina hat das bisherige Album nicht übernommen');
  pruefe(emil && emil.album && emil.album.length === 0, 'Emil sollte ein leeres Album haben');
  await kindWaehlen(emil.id);
  await erfolg(m, maus);
  pruefe((await datenbank.kinder()).find((k) => k.id === emil.id).album.includes('m|Maus'), 'Emils Sticker nicht gespeichert');
  pruefe((await datenbank.kinder()).find((k) => k.id === lina.id).album.length === 2, 'Linas Album verändert');

  // Ansicht: Album von Lina
  await kindWaehlen(lina.id);
  await albumOeffnen();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'ALBUM-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
