// Testet mehrere Wörter je Buchstabe und persönliche Wörter. Frisches Browserprofil; Ansicht per #eltern oder #spuren.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  window.confirm = () => true;
  const m = BUCHSTABEN.find((e) => e.b === 'm');

  // 1. Standard-Vorrat
  const vorrat = woerterFuer(m);
  pruefe(vorrat.map((w) => w.wort).join() === 'Maus,Mond,Möhre', `Vorrat m: ${vorrat.map((w) => w.wort)}`);
  pruefe(vorrat[1].ansage()[0].url === 'audio/m-2.wav' && vorrat[2].wortAllein()[0].url === 'audio/m-3-wort.wav', 'Audio-Pfade falsch');

  // 2. Alle Audiodateien der weiteren Wörter vorhanden
  for (const e of BUCHSTABEN) {
    for (const w of woerterFuer(e)) {
      for (const q of [...w.ansage(), ...w.wortAllein()]) {
        if (!(await fetch(q.url, { method: 'HEAD' })).ok) fehler.push(`fehlt: ${q.url}`);
      }
    }
  }

  // 3. Verteilung ohne persönliche Wörter: etwa gleich
  const zaehle = (n, vorher = null) => {
    const z = {};
    for (let i = 0; i < n; i++) { const w = wortWaehlen(m, vorher); z[w.wort] = (z[w.wort] || 0) + 1; }
    return z;
  };
  const z1 = zaehle(3000);
  pruefe(Object.values(z1).every((n) => n > 800 && n < 1200), `Verteilung: ${JSON.stringify(z1)}`);
  pruefe(!zaehle(500, vorrat[0]).Maus, 'Gleiches Wort zweimal hintereinander');

  // 4. Persönliches Wort über den Elternbereich anlegen (Profil "Papa")
  window.prompt = () => 'Papa';
  await profilNeu();
  window.prompt = () => 'Mama';
  await eigenesWortNeu(m);
  const papa = (await datenbank.profile()).find((p) => p.name === 'Papa');
  pruefe(papa.woerter && papa.woerter.length === 1 && papa.woerter[0].wort === 'Mama', 'Wort nicht im Profil gespeichert');
  const id = papa.woerter[0].id;
  const foto = await new Promise((r) => { const c = document.createElement('canvas'); c.width = c.height = 32; c.toBlob(r, 'image/jpeg'); });
  await datenbank.medienSetzen(papa.id, `w-${id}`, 'bild', foto);
  await datenbank.medienSetzen(papa.id, `w-${id}`, 'stimme', new Blob(['mama'], { type: 'audio/webm' }));
  await medienLaden();
  const eigen = woerterFuer(m).find((w) => w.art === 'eigen');
  pruefe(eigen && eigen.bild().includes('blob:'), 'Foto des eigenen Wortes fehlt');
  const ansage = eigen.ansage();
  pruefe(ansage.length === 2 && ansage[0].url === 'audio/m-laut.wav' && ansage[1].url.startsWith('blob:'), 'Ansage eigenes Wort falsch');
  const z2 = zaehle(3000);
  pruefe(z2.Mama > 1300 && z2.Mama < 1700, `Eigenes Wort sollte ~50 % sein: ${JSON.stringify(z2)}`);

  // 5. Lob mit eigenem Wort endet mit der eigenen Aufnahme
  const lob = wiedergabeFolge(m, true, null, false, eigen);
  pruefe(lob.length === 2 && lob[1].url.startsWith('blob:'), 'Lob mit eigenem Wort falsch');

  // 6. Wort ohne passenden Anfangsbuchstaben wird erkannt
  pruefe(faengtAnMit('Mama', 'm') && !faengtAnMit('Oma', 'm') && faengtAnMit('Fuß', 'ß'), 'Anfangsbuchstaben-Prüfung');

  // 7. Elternbereich zeigt das Wort
  await elternOeffnen();
  pruefe(document.querySelectorAll('.eigenes-wort').length === 1, 'Eigenes Wort nicht im Elternbereich');

  // 8. Sicherung enthält Wort + Medien
  const sicherung = await sicherungErstellen();
  const ps = sicherung.profile.find((p) => p.id === papa.id);
  pruefe(ps.woerter.length === 1 && ps.medien.filter((x) => x.schluessel.includes(`w-${id}`)).length === 2, 'Wort fehlt in der Sicherung');

  // 9. Löschen entfernt Wort und Medien
  window.prompt = () => 'Mond2';
  await eigenesWortNeu(m);
  const zweites = (await aktivesProfil()).woerter.find((w) => w.wort === 'Mond2');
  await eigenesWortLoeschen(zweites);
  pruefe(!(await aktivesProfil()).woerter.some((w) => w.wort === 'Mond2'), 'Wort nicht gelöscht');

  // Ansicht für den Screenshot
  if (location.hash === '#spuren') {
    zustand.schreibweise = 'klein';
    let i = 0;
    do { buchstabeOeffnen(BUCHSTABEN.indexOf(m)); i++; } while (zustand.wahl.art !== 'eigen' && i < 50);
  } else {
    await elternOeffnen();
    [...document.querySelectorAll('.eigenes-wort')][0].scrollIntoView({ block: 'center' });
  }
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'WÖRTER-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
