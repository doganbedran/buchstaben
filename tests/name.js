// Testet "Mein Name": Zeichen des Namens, Ablauf Buchstabe für Buchstabe, Ende. Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  const gespielt = [];
  folgeAbspielen = (folge) => { gespielt.push(folge.map((q) => q.url)); return Promise.resolve(); };
  einstellungenSpeichern = () => Promise.resolve();
  const r = () => canvas.getBoundingClientRect();
  const ev = (typ, x, y) => canvas.dispatchEvent(new PointerEvent(typ, { pointerId: 7, isPrimary: true, clientX: r().left + x, clientY: r().top + y, bubbles: true }));
  const buchstabeZiehen = () => {
    for (const pfad of gefuehrt.pfade) {
      ev('pointerdown', pfad.p[0].x, pfad.p[0].y);
      pfad.p.forEach((q) => ev('pointermove', q.x, q.y));
      ev('pointerup', pfad.p[pfad.p.length - 1].x, pfad.p[pfad.p.length - 1].y);
    }
  };

  // 1. Zeichen aus dem Namen
  pruefe(nameZeichen('Lina').join('') === 'Lina', `Lina -> ${nameZeichen('Lina').join('')}`);
  pruefe(nameZeichen('emil').join('') === 'Emil', 'Kleingeschrieben sollte groß beginnen');
  pruefe(nameZeichen('Jo-Ann').join('') === 'Joann', `Jo-Ann -> ${nameZeichen('Jo-Ann').join('')}`);
  pruefe(nameZeichen('Özlem').join('') === 'Özlem', 'Umlaut am Anfang');
  pruefe(nameZeichen('Ju\u0308rgen').join('') === 'Jürgen', 'Zerlegter Umlaut (iPhone)');

  // 2. Ohne Kind kein Name-Knopf
  rasterZeichnen();
  pruefe(document.querySelector('.spiel-btn[data-spiel="name"]').hidden, 'Name-Knopf ohne Kind sichtbar');

  // 3. Kind anlegen und auswählen
  await datenbank.kindSpeichern({ id: 'k-lina', name: 'Lina', tier: '🦊', foto: null, nameStimme: null,
    schreibweise: 'klein', sterne: {}, profil: 'standard', erstellt: 1 });
  await kinderLaden();
  await kindWaehlen('k-lina');
  rasterZeichnen();
  const knopf = document.querySelector('.spiel-btn[data-spiel="name"]');
  pruefe(!knopf.hidden, 'Name-Knopf mit Kind nicht sichtbar');

  // 4. Spiel starten und Buchstabe für Buchstabe nachspuren
  knopf.click();
  pruefe($('#trace').classList.contains('active') && !$('#name-leiste').hidden, 'Name-Modus nicht geöffnet');
  const gesehen = [];
  for (let i = 0; i < 4; i++) {
    clearTimeout(tafelZustand.jubelTimer);
    tafelAufbauen();
    gesehen.push(text());
    pruefe(document.querySelectorAll('#name-leiste .fertig').length === i, `Vor Buchstabe ${i + 1}: falsche Leiste`);
    buchstabeZiehen();
    pruefe(zustand.nameModus && zustand.nameModus.pos === i + 1, `Buchstabe ${i + 1} nicht geschafft`);
  }
  pruefe(gesehen.join('') === 'Lina', `Reihenfolge: ${gesehen.join('')}`);
  pruefe(document.querySelectorAll('#name-leiste .fertig').length === 4, 'Am Ende nicht alles farbig');
  pruefe($('#jubel').classList.contains('zeigen'), 'Kein Jubel am Ende');
  const sterneVorher = JSON.stringify(zustand.sterne);
  pruefe(sterneVorher === '{}', 'Name-Modus sollte keine Buchstaben-Sterne vergeben');

  // 5. Danach normales Nachspuren wieder ohne Name-Modus
  clearTimeout(tafelZustand.jubelTimer);
  buchstabeOeffnen(0);
  pruefe(!zustand.nameModus && $('#name-leiste').hidden && text() === 'a', 'Name-Modus hängt nach');

  // 6. Weitere Namen: Geschwister und „Meine Leute“ (nur ein Wort, das die Tafel schreiben kann) → Auswahl über Gesichter
  clearTimeout(tafelZustand.jubelTimer);
  zurStartseite(); await new Promise((r) => setTimeout(r, 300));
  const bild = await new Promise((r) => { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#3d7be8'; g.fillRect(0, 0, 8, 8); c.toBlob(r, 'image/png'); });
  const ton = new Blob(['x'], { type: 'audio/webm' });
  pruefe(namenZumSpuren().length === 1, 'Ohne weitere Namen gibt es eine Auswahl');
  await datenbank.kindSpeichern({ id: 'k-emil', name: 'Emil', tier: '🐻', foto: null, nameStimme: ton, schreibweise: 'klein', sterne: {}, profil: 'p-fam', erstellt: 2 });
  await datenbank.profilSpeichern({ id: 'p-fam', name: 'Familie', erstellt: 1, woerter: [], kistenWoerter: [
    { id: 'oma1', kiste: 'leute', wort: 'Oma', name: true }, { id: 'tante1', kiste: 'leute', wort: 'Tante Anna', name: true },
    { id: 'opa1', kiste: 'leute', wort: 'Opa', name: true }, { id: 'ela1', kiste: 'leute', wort: 'Ela', name: true },
    { id: 'udo1', kiste: 'leute', wort: 'Udo' }] });   // Udo: von den Eltern nicht für „Mein Name“ freigegeben
  for (const id of ['oma1', 'tante1', 'ela1', 'udo1']) { await datenbank.medienSetzen('p-fam', `w-${id}`, 'bild', bild); await datenbank.medienSetzen('p-fam', `w-${id}`, 'stimme', ton); }
  await datenbank.medienSetzen('p-fam', 'w-opa1', 'stimme', ton);   // Opa ohne Foto: nicht in der Auswahl
  await kinderLaden();
  const lina = kinder.find((x) => x.id === 'k-lina');
  lina.profil = 'p-fam';
  await datenbank.kindSpeichern(lina);
  await kinderLaden();
  await kindWaehlen('k-lina');
  const namen = namenZumSpuren().map((p) => p.name);
  pruefe(namen.join(',') === 'Lina,Emil,Oma,Ela', `Namen: ${namen}`);
  rasterZeichnen();
  document.querySelector('.spiel-btn[data-spiel="name"]').click();
  pruefe($('#name-wahl').classList.contains('active'), 'Keine Namens-Auswahl');
  const kacheln = [...document.querySelectorAll('#name-wahl-raster .spiel-btn')];
  pruefe(kacheln.length === 4 && kacheln[0].getAttribute('aria-label') === 'Lina', 'Eigener Name nicht vorn');
  pruefe(kacheln[2].querySelector('img.kiste-foto'), 'Oma ohne Foto auf der Kachel');
  kacheln.forEach((b) => { const r = b.getBoundingClientRect(); pruefe(r.bottom <= innerHeight && r.right <= innerWidth && r.width >= 90, `Kachel ${b.getAttribute('aria-label')}`); });
  pruefe(gespielt.slice(-1)[0][0] === 'audio/ansage-name-aussuchen.wav', 'Keine Ansage bei der Auswahl');
  kacheln[2].click();
  pruefe(history.state && history.state.screen === 'trace', 'Auswahl nicht durch Nachspuren ersetzt');
  pruefe($('#trace').classList.contains('active') && zustand.nameModus.zeichen.join('') === 'Oma', 'Oma nicht zum Nachspuren');
  pruefe($('#bild img'), 'Kein Foto von Oma beim Nachspuren');
  for (let i = 0; i < 3; i++) { clearTimeout(tafelZustand.jubelTimer); tafelAufbauen(); buchstabeZiehen(); }
  pruefe($('#jubel').classList.contains('zeigen') && $('#jubel-bild img'), 'Kein Jubel mit Omas Foto');
  pruefe(gespielt.length && gespielt.slice(-1)[0][0].startsWith('blob:') && gespielt.slice(-1)[0][1].startsWith('audio/lob-'), `Bei Omas Namen nicht erst „Oma“, dann Lob: ${gespielt.slice(-1)[0]}`);
  // Elternbereich: Schalter je Person
  await elternOeffnen();
  const schalter = [...document.querySelectorAll('.eigene-kiste[data-kiste="leute"] .name-schalter')];
  pruefe(schalter.length === 4, `Schalter: ${schalter.length}`);   // nicht bei „Tante Anna“
  const udo = schalter.find((l) => l.previousElementSibling.textContent.includes('Udo'));
  pruefe(udo && !udo.querySelector('input').checked, 'Udo-Schalter');
  udo.querySelector('input').click();
  await new Promise((r) => setTimeout(r, 400));
  pruefe(namenZumSpuren().some((p) => p.name === 'Udo'), 'Schalter wirkt nicht');
  window.prompt = () => 'Mama';
  [...document.querySelectorAll('.eigene-kiste[data-kiste="leute"] button')].find((b) => b.textContent.startsWith('➕')).click();
  await new Promise((r) => setTimeout(r, 400));
  pruefe(eigeneKistenWoerter.find((w) => w.wort === 'Mama').name === true, 'Neue Person nicht standardmäßig bei „Mein Name“');
  history.back(); await new Promise((r) => setTimeout(r, 300));
  clearTimeout(tafelZustand.jubelTimer);
  $('#jubel').classList.remove('zeigen');
  zustand.nameModus = null; nameLeisteZeichnen();
  zurStartseite(); await new Promise((r) => setTimeout(r, 300));
  pruefe($('#home').classList.contains('active') && !(history.state && history.state.screen), 'Zurück nicht zur Startseite (Auswahl bleibt im Verlauf)');

  // Screenshot: Namens-Auswahl
  rasterZeichnen();
  document.querySelector('.spiel-btn[data-spiel="name"]').click();
  await new Promise((r) => setTimeout(r, 100));
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'NAME-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
