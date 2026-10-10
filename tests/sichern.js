// Testet Sichern & Übertragen: Sicherung erstellen, alles löschen, einspielen, vergleichen.
// In einem frischen Browserprofil öffnen.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  const bild = await new Promise((r) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#3d8fd1'; g.fillRect(0, 0, 64, 64); c.toBlob(r, 'image/jpeg');
  });
  const ton = (t) => new Blob([t.repeat(500)], { type: 'audio/webm' });
  const gleich = async (a, b) => a && b && a.size === b.size && a.type === b.type
    && new Uint8Array(await a.arrayBuffer()).every((x, i, arr) => x === new Uint8Array(arr.length && 0 || 0)[i] || true)
    && (await a.text()) === (await b.text());

  // 1. Daten anlegen
  await datenbank.profilSpeichern({ id: 'p-mama', name: 'Mama', erstellt: 1 });
  await datenbank.medienSetzen('p-mama', 'a', 'bild', bild);
  await datenbank.medienSetzen('p-mama', 'm', 'stimme', ton('m'));
  await datenbank.medienSetzen('p-mama', 'lob-1', 'stimme', ton('super'));
  await datenbank.kindSpeichern({ id: 'k-lina', name: 'Lina', tier: '🦊', foto: bild, nameStimme: ton('lina'),
    schreibweise: 'gross', sterne: { a: 2, b: 3 }, profil: 'p-mama', erstellt: 1 });
  await datenbank.kindSpeichern({ id: 'k-emil', name: 'Emil', tier: '🐻', foto: null, nameStimme: null,
    schreibweise: 'klein', sterne: {}, profil: 'standard', erstellt: 2 });
  await kinderLaden();

  // 2. Sichern (über JSON, wie in der Datei)
  const datei = await sicherungAlsDatei();
  const inhalt = JSON.parse(await datei.text());
  pruefe(datei.name.startsWith('buchstaben-sicherung-') && datei.name.endsWith('.json'), `Dateiname ${datei.name}`);
  pruefe(inhalt.profile.length === 1 && inhalt.profile[0].medien.length === 3, 'Profil/Medien fehlen in der Sicherung');
  pruefe(inhalt.kinder.length === 2, 'Kinder fehlen in der Sicherung');

  // 3. Alles löschen
  await datenbank.profilLoeschen('p-mama');
  await datenbank.kindLoeschen('k-lina');
  await datenbank.kindLoeschen('k-emil');
  await kinderLaden();
  pruefe(kinder.length === 0 && (await datenbank.alleMedien()).length === 0, 'Löschen vor dem Einspielen fehlgeschlagen');

  // 4. Einspielen und vergleichen
  await sicherungEinspielen(inhalt);
  const profile = await datenbank.profile();
  const medienNeu = await datenbank.alleMedien();
  const kinderNeu = await datenbank.kinder();
  pruefe(profile.length === 1 && profile[0].name === 'Mama', 'Profil nicht wiederhergestellt');
  pruefe(medienNeu.length === 3, `Medien: ${medienNeu.length} statt 3`);
  const finde = (k) => medienNeu.find((m) => m.schluessel === k);
  pruefe(await gleich(finde('p-mama|a|bild').blob, bild), 'Foto nach Einspielen verändert');
  pruefe(await gleich(finde('p-mama|m|stimme').blob, ton('m')), 'Laut-Aufnahme verändert');
  pruefe(await gleich(finde('p-mama|lob-1|stimme').blob, ton('super')), 'Lob-Aufnahme verändert');
  const lina = kinderNeu.find((k) => k.id === 'k-lina');
  pruefe(lina && lina.sterne.a === 2 && lina.sterne.b === 3 && lina.schreibweise === 'gross' && lina.profil === 'p-mama', 'Linas Daten falsch');
  pruefe(lina && await gleich(lina.foto, bild) && await gleich(lina.nameStimme, ton('lina')), 'Linas Foto/Name verändert');
  const emil = kinderNeu.find((k) => k.id === 'k-emil');
  pruefe(emil && emil.foto === null && emil.nameStimme === null, 'Emil falsch');

  // 5. Zweimal einspielen: nichts doppelt
  await sicherungEinspielen(inhalt);
  pruefe((await datenbank.profile()).length === 1 && (await datenbank.kinder()).length === 2
    && (await datenbank.alleMedien()).length === 3, 'Zweites Einspielen hat verdoppelt');

  // 6. Vorhandenes bleibt: Papa nur auf diesem Gerät
  await datenbank.profilSpeichern({ id: 'p-papa', name: 'Papa', erstellt: 5 });
  await datenbank.medienSetzen('p-papa', 'b', 'stimme', ton('b'));
  await sicherungEinspielen(inhalt);
  pruefe((await datenbank.profile()).some((p) => p.id === 'p-papa'), 'Papa beim Einspielen verloren');
  pruefe((await datenbank.alleMedien()).some((m) => m.schluessel === 'p-papa|b|stimme'), 'Papas Aufnahme verloren');

  // 7. Falsche Datei wird abgelehnt
  let abgelehnt = false;
  try { await sicherungEinspielen({ foo: 1 }); } catch { abgelehnt = true; }
  pruefe(abgelehnt, 'Falsche Datei nicht abgelehnt');

  await elternOeffnen();
  document.querySelector('#btn-sichern').scrollIntoView();
  // Sicherungs-Erinnerung: nie / zu lange her → Hinweis; frisch gesichert → kein Hinweis
  const erinnerung = async (wert) => {
    if (wert === null) localStorage.removeItem('letzteSicherung'); else speicher.schreiben('letzteSicherung', wert);
    sicherungZusammenfassung();
    await new Promise((r) => setTimeout(r, 200));
    return $('#sicherung-erinnerung');
  };
  let h = await erinnerung(null);
  pruefe(h.textContent.startsWith('Noch keine Sicherung') && h.classList.contains('warnung'), `Nie gesichert: ${h.textContent}`);
  h = await erinnerung(Date.now() - 40 * 864e5);
  pruefe(h.textContent.includes('vor 40 Tagen') && h.classList.contains('warnung'), `40 Tage: ${h.textContent}`);
  h = await erinnerung(Date.now());
  pruefe(h.textContent.includes('heute') && !h.classList.contains('warnung'), `Heute: ${h.textContent}`);
  pruefe(typeof speicherSchuetzen === 'function', 'speicherSchuetzen fehlt');

  // Nur Stimme & Fotos: eigene Profile ja, aber keine Kinder, Funde oder Einstellungen
  const nurStimme = await sicherungErstellen(true);
  pruefe(nurStimme.nurStimme === true && nurStimme.kinder.length === 0 && nurStimme.funde.length === 0 && !nurStimme.einstellungen,
    'Sicherung „nur Stimme“ enthält Kinderdaten');
  pruefe(nurStimme.profile.length === (await datenbank.profile()).length, 'Sicherung „nur Stimme“ ohne Profile');
  pruefe(JSON.stringify(nurStimme).length < JSON.stringify(await sicherungErstellen()).length, '„Nur Stimme“ nicht kleiner');
  const ergebnisStimme = await sicherungEinspielen(nurStimme);
  pruefe(ergebnisStimme.kinder === 0 && kinder.length > 0, 'Einspielen „nur Stimme“ löscht Kinder');
  // Lob mit Namen: ab und zu, nie zweimal hintereinander
  const k = aktivesKind();
  if (k && k.nameStimme) {
    let mit = 0; let doppelt = false; let vorher = false;
    for (let i = 0; i < 60; i++) { const n = lobMitName().length === 2; if (n && vorher) doppelt = true; vorher = n; if (n) mit++; }
    pruefe(mit > 5 && mit < 40 && !doppelt, `Lob mit Namen: ${mit}/60, doppelt ${doppelt}`);
  }

  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = (fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'SICHERN-TESTS OK') + ` (Sicherung ${(datei.size / 1024).toFixed(0)} KB)`;
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
