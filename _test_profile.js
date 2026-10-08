// Testet Profile: Übernahme alter Aufnahmen, Profil anlegen, Foto, Standard, Löschen.
// Mit frischem Browserprofil öffnen (leere Datenbank), siehe README.
(async function () {
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const fehler = [];
  const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };
  await warte(800);

  // 1. Alte Aufnahme wurde in "Eigene Aufnahmen" übernommen und ist aktiv
  pruefe(zustand.profil === 'p-uebernommen', `Übernahme: aktives Profil ${zustand.profil}`);
  pruefe(medien.m && medien.m.stimme, 'Übernahme: Aufnahme für m fehlt');
  const alle = await datenbank.profile();
  pruefe(alle.some((p) => p.name === 'Eigene Aufnahmen'), 'Übernahme: Profil fehlt');

  // 2. Neues Profil "Mama" anlegen (prompt simuliert)
  window.prompt = () => 'Mama';
  await profilNeu();
  const mama = (await datenbank.profile()).find((p) => p.name === 'Mama');
  pruefe(mama && zustand.profil === mama.id, 'Neues Profil nicht aktiv');
  pruefe(!medien.m, 'Neues Profil sollte leer sein');

  // 3. Foto für "a" setzen (Testbild: grüner Kreis auf Orange)
  const c = document.createElement('canvas');
  c.width = 800; c.height = 600;
  const g = c.getContext('2d');
  g.fillStyle = '#f28c38'; g.fillRect(0, 0, 800, 600);
  g.fillStyle = '#4caf50'; g.beginPath(); g.arc(400, 300, 220, 0, Math.PI * 2); g.fill();
  const roh = await new Promise((r) => c.toBlob(r, 'image/png'));
  const foto = await fotoVerkleinern(roh);
  const fotoBild = await createImageBitmap(foto);
  pruefe(fotoBild.width === 512 && fotoBild.height === 512, `Foto nicht 512x512: ${fotoBild.width}x${fotoBild.height}`);
  await datenbank.medienSetzen(zustand.profil, 'a', 'bild', foto);
  await datenbank.medienSetzen(zustand.profil, 'b', 'stimme', new Blob(['y'], { type: 'audio/webm' }));
  await medienLaden();
  pruefe(bildHtml(BUCHSTABEN[0]).includes('blob:'), 'Eigenes Foto wird nicht angezeigt');
  pruefe(medien.b && medien.b.stimme, 'Eigene Stimme für b fehlt');
  pruefe(bildHtml(BUCHSTABEN[1]) === '🍌', 'Nicht geändertes Bild sollte Standard bleiben');

  // 4. Standard: keine eigenen Medien
  await profilAktivieren('standard');
  pruefe(bildHtml(BUCHSTABEN[0]) === '🍎', 'Standard zeigt eigenes Foto');
  pruefe(!medien.b, 'Standard hat eigene Stimme');

  // 5. Löschen entfernt Profil und alle Medien
  const weg = { id: 'p-weg', name: 'Weg', erstellt: Date.now() };
  await datenbank.profilSpeichern(weg);
  await datenbank.medienSetzen('p-weg', 'c', 'bild', foto);
  await datenbank.profilLoeschen('p-weg');
  pruefe((await datenbank.medienVon('p-weg')).length === 0, 'Löschen: Medien übrig');
  pruefe(!(await datenbank.profile()).some((p) => p.id === 'p-weg'), 'Löschen: Profil übrig');
  pruefe((await datenbank.medienVon(mama.id)).length === 2, 'Löschen hat fremde Medien entfernt');

  // 6. Elternbereich mit Profil "Mama" für den Screenshot
  await profilAktivieren(mama.id);
  // #start: Kinderansicht (Startseite mit eigenem Foto) statt Elternbereich zeigen
  if (location.hash === '#start') rasterZeichnen();
  else await elternOeffnen();

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#000c;color:#fff;font:12px monospace;padding:6px;z-index:9';
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'PROFIL-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:red;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
