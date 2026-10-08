// Testet die Buchstaben-Jagd. Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  await startFertig;
  window.confirm = () => true;
  const gespielt = [];
  folgeAbspielen = (folge) => { gespielt.push(folge.map((q) => q.url)); return Promise.resolve(); };
  const foto = (farbe) => new Promise((r) => { const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = farbe; g.fillRect(0, 0, 64, 64); c.toBlob(r, 'image/jpeg'); });

  // 1. Auswahl: nie schwer zu findende Buchstaben
  for (let i = 0; i < 300; i++) { jagdNeuerBuchstabe(); if ('cqvxyäöüß'.includes(jagd.b)) { fehler.push(`Jagd auf ${jagd.b}`); break; } }

  // 2. Start über die Leiste: Buchstabe + Ansage
  gespielt.length = 0;
  document.querySelector('.spiel-btn[data-spiel="jagd"]').click();
  pruefe($('#jagd').classList.contains('active') && $('#jagd-buchstabe').innerHTML.includes('<svg'), 'Jagd nicht geöffnet');
  pruefe(gespielt[0] && gespielt[0][0] === 'audio/ansage-jagd.wav' && gespielt[0][1] === `audio/${dateiName(jagd.b)}-laut.wav`, 'Ansage falsch');
  pruefe($('#btn-jagd-fertig').hidden && $('#btn-jagd-stimme').hidden, 'Fertig/Stimme vor dem Foto sichtbar');

  // 3. Foto + Wort, speichern (ohne Kinder)
  const b1 = jagd.b;
  jagdFotoGesetzt(await foto('#e8463c'));
  pruefe(!$('#btn-jagd-fertig').hidden && !$('#jagd-foto').hidden && $('#jagd-buchstabe').hidden, 'Nach dem Foto falsche Knöpfe');
  jagdStimmeGesetzt(new Blob(['wort'], { type: 'audio/webm' }));
  await jagdSpeichern();
  clearTimeout(jagd.timer);
  pruefe(zustand.funde.length === 1 && zustand.funde[0].b === b1, 'Fund nicht gespeichert');
  pruefe((await datenbank.medienVon('fund-ohne')).length === 2, 'Foto/Wort nicht in der Datenbank');
  pruefe($('#jagd-jubel').classList.contains('zeigen'), 'Kein Jubel');

  // 4. Erstes Kind übernimmt die Funde (auch die Fotos)
  window.prompt = () => 'Lina';
  $('#btn-kind-neu').click(); await warte(500);
  const lina = kinder.find((k) => k.name === 'Lina');
  pruefe(lina.funde && lina.funde.length === 1, 'Lina hat die Funde nicht übernommen');
  pruefe((await datenbank.medienVon(`fund-${lina.id}`)).length === 2 && (await datenbank.medienVon('fund-ohne')).length === 0, 'Fotos nicht umgezogen');
  history.back(); await warte(300); history.back(); await warte(300);
  await kindWaehlen(lina.id);

  // 5. Noch ein Fund für Lina, dann Album
  $('#jagd-jubel').classList.remove('zeigen');
  jagdNeuerBuchstabe();
  jagdFotoGesetzt(await foto('#3d8fd1'));
  await jagdSpeichern(); clearTimeout(jagd.timer);
  await albumOeffnen();
  pruefe(document.querySelectorAll('.sticker.fund').length === 2, `Funde im Album: ${document.querySelectorAll('.sticker.fund').length}`);

  // 6. Sicherung enthält Funde; Kind löschen entfernt sie
  const s = await sicherungErstellen();
  pruefe(s.funde.length === 3, `Funde in der Sicherung: ${s.funde.length}`);
  kindBearbeiten(lina.id); await warte(200);
  $('#btn-kind-loeschen').click(); await warte(500);
  pruefe((await datenbank.medienVon(`fund-${lina.id}`)).length === 0, 'Funde nach Löschen des Kindes übrig');
  await sicherungEinspielen(JSON.parse(JSON.stringify(s)));
  pruefe((await datenbank.medienVon(`fund-${lina.id}`)).length === 3, 'Funde nach Einspielen nicht zurück');

  // Ansicht: Album mit Funden
  await kindWaehlen(lina.id);
  await albumOeffnen();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'JAGD-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
