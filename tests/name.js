// Testet "Mein Name": Zeichen des Namens, Ablauf Buchstabe für Buchstabe, Ende. Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
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

  // Screenshot: Name-Modus, zwei Buchstaben geschafft
  knopf.click();
  for (let i = 0; i < 2; i++) { clearTimeout(tafelZustand.jubelTimer); tafelAufbauen(); buchstabeZiehen(); }
  clearTimeout(tafelZustand.jubelTimer); tafelAufbauen();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'NAME-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
