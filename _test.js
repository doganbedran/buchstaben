// Testet die Spur-Erkennung für alle Buchstaben (klein und groß):
// sauber = erkannt, kritzeln = nicht erkannt, große Lücke / fehlendes Teil / fehlender Querstrich = nicht erkannt,
// kleine Lücke = erkannt (Kinder dürfen ungenau sein).
(function () {
  einstellungenSpeichern = () => Promise.resolve();
  // Schneller: nicht nach jedem Teilstrich prüfen, sondern einmal am Ende jedes Testfalls
  const echtesPruefen = pruefen;
  pruefen = () => {};
  const ergebnis = [];
  window.testErgebnis = ergebnis;
  const rect = () => canvas.getBoundingClientRect();
  function ev(typ, x, y) {
    const r = rect();
    canvas.dispatchEvent(new PointerEvent(typ, { pointerId: 7, clientX: r.left + x, clientY: r.top + y, bubbles: true }));
  }
  function vorbereiten(i) {
    zustand.index = i;
    zeigen('trace', false);
    tafelAufbauen();
  }
  // Zeilenweise alle Abschnitte der Maske nachfahren (wie ein Kind, das den Buchstaben ausmalt)
  function nachfahren(maske, abschnittOk = () => true) {
    const w = pruef.spur.width, s = pruef.skala;
    for (let y = 0; y < pruef.spur.height; y += 3) {
      let start = -1;
      for (let x = 0; x <= w; x++) {
        const drin = x < w && maske[y * w + x];
        if (drin && start < 0) start = x;
        if (!drin && start >= 0) {
          if (abschnittOk(start, x - 1, y)) {
            ev('pointerdown', start / s, y / s); ev('pointermove', (x - 1) / s, y / s); ev('pointerup', (x - 1) / s, y / s);
          }
          start = -1;
        }
      }
    }
    echtesPruefen();
    return tafelZustand.geschafft;
  }
  function kritzeln() {
    const { breite, hoehe } = tafelZustand;
    for (let k = 0; k < 6; k++) {
      ev('pointerdown', 10, hoehe * (k / 6)); ev('pointermove', breite - 10, hoehe * ((k + 1) / 6)); ev('pointerup', breite - 10, hoehe * ((k + 1) / 6));
    }
    echtesPruefen();
    return tafelZustand.geschafft;
  }
  // Ziel-Maske ohne ein Quadrat (Seitenlänge in Strichbreiten) um einen Punkt des Buchstabens
  function ohneLoch(punktNr, groesse) {
    const w = pruef.spur.width;
    const pixel = [];
    pruef.ziel.forEach((v, i) => { if (v) pixel.push(i); });
    const mitte = pixel[Math.floor((punktNr + 0.5) / 4 * pixel.length)];
    const mx = mitte % w, my = (mitte - mx) / w, r = (groesse * pruef.strichbreite) / 2;
    return pruef.ziel.map((v, i) => {
      const x = i % w, y = (i - x) / w;
      return v && !(Math.abs(x - mx) <= r && Math.abs(y - my) <= r) ? 1 : 0;
    });
  }
  const kurz = (m) => m ? `abd=${(m.abdeckung||0).toFixed(2)} lücke=${m.groessteLuecke} erlaubt=${(m.erlaubteLuecke||0).toFixed(0)} w=${pruef.strichbreite.toFixed(1)} teilFehlt=${m.teilFehlt}` : '-';
  // Mittellinien der Beine und Querstrich aus der Maske bestimmen (in Bildschirm-Koordinaten)
  function beine() {
    const w = pruef.spur.width, s = pruef.skala, sb = pruef.strichbreite;
    const links = [], rechts = [], querZeilen = [];
    for (let y = 0; y < pruef.spur.height; y++) {
      const abschnitte = [];
      let start = -1;
      for (let x = 0; x <= w; x++) {
        const drin = x < w && pruef.ziel[y * w + x];
        if (drin && start < 0) start = x;
        if (!drin && start >= 0) { abschnitte.push([start, x - 1]); start = -1; }
      }
      if (!abschnitte.length) continue;
      if (abschnitte.length === 1 && abschnitte[0][1] - abschnitte[0][0] > 2.2 * sb) { querZeilen.push({ y, a: abschnitte[0] }); continue; }
      const l = abschnitte[0], r = abschnitte[abschnitte.length - 1];
      links.push({ x: (l[0] + l[1]) / 2 / s, y: y / s });
      rechts.push({ x: (r[0] + r[1]) / 2 / s, y: y / s });
    }
    const q = querZeilen[Math.floor(querZeilen.length / 2)];
    const quer = q ? [{ x: (q.a[0] + sb / 2) / s, y: q.y / s }, { x: (q.a[1] - sb / 2) / s, y: q.y / s }] : [];
    return { links, rechts, quer };
  }
  function strich(punkte) {
    if (!punkte.length) return;
    ev('pointerdown', punkte[0].x, punkte[0].y);
    punkte.forEach((p) => ev('pointermove', p.x, p.y));
    ev('pointerup', punkte[punkte.length - 1].x, punkte[punkte.length - 1].y);
  }
  function test(name, erwartet, ausfuehren) {
    const ist = ausfuehren();
    if (ist !== erwartet) ergebnis.push(`${text()} ${name}: ${ist} ${kurz(tafelZustand.messung)}`);
  }

  for (const schreibweise of ['klein', 'gross']) {
    zustand.schreibweise = schreibweise;
    BUCHSTABEN.forEach((e, i) => {
      vorbereiten(i); test('sauber', true, () => nachfahren(pruef.ziel));
      vorbereiten(i); test('kritzeln', false, kritzeln);
      for (let p = 0; p < 4; p++) {
        vorbereiten(i); test(`großes Loch ${p}`, false, () => nachfahren(ohneLoch(p, 3)));
        vorbereiten(i); test(`kleines Loch ${p}`, true, () => nachfahren(ohneLoch(p, 0.6)));
      }
      // Kleinstes Einzelteil weglassen (i-Punkt, Umlaut-Punkt)
      vorbereiten(i);
      if (pruef.teile.length > 1) {
        const kleinstes = new Set(pruef.teile.reduce((a, b) => (a.length <= b.length ? a : b)));
        test('ohne Punkt', false, () => nachfahren(pruef.ziel.map((v, j) => (v && !kleinstes.has(j) ? 1 : 0))));
      }
    });
    // A und H ohne Querstrich: lange waagerechte Abschnitte auslassen
    // (nur Großbuchstaben: kleines a und h haben keinen Querstrich)
    for (const b of schreibweise === 'gross' ? ['a', 'h'] : []) {
      vorbereiten(BUCHSTABEN.findIndex((e) => e.b === b));
      test('ohne Querstrich', false, () => nachfahren(pruef.ziel, (x0, x1) => x1 - x0 < 2.2 * pruef.strichbreite));
      window.querstrich = (window.querstrich || []).concat(`${text()}: ${kurz(tafelZustand.messung)}`);
    }
    // Wie ein Kind: zwei Striche entlang der Beine (A: Schrägen, H: Senkrechte), ohne bzw. mit Querstrich
    for (const b of schreibweise === 'gross' ? ['a', 'h'] : []) {
      const i = BUCHSTABEN.findIndex((e) => e.b === b);
      vorbereiten(i);
      const { links, rechts, quer } = beine();
      test('Kind: nur Beine', false, () => { strich(links); strich(rechts); echtesPruefen(); return tafelZustand.geschafft; });
      window.querstrich.push(`${text()} nur Beine: ${kurz(tafelZustand.messung)}`);
      vorbereiten(i);
      test('Kind: Beine + Querstrich', true, () => { strich(links); strich(rechts); strich(quer); echtesPruefen(); return tafelZustand.geschafft; });
    }
  }
  zustand.schreibweise = 'klein';

  // Für den Screenshot: "y" halb nachgespurt zeigen
  zustand.index = BUCHSTABEN.findIndex((e) => e.b === 'y'); zeigen('trace', false); tafelAufbauen();
  $('#bild').innerHTML = bildHtml(BUCHSTABEN[zustand.index]); $('#fortschritt').textContent = sterneText(1);
  ev('pointerdown', tafelZustand.breite * 0.2, tafelZustand.hoehe * 0.4); ev('pointermove', tafelZustand.breite * 0.22, tafelZustand.hoehe * 0.65); ev('pointerup', 0, 0);
  const ok = ergebnis.length === 0;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:' + (ok ? '#1b7f3a' : '#c62828') + ';color:#fff;font:11px monospace;padding:6px;z-index:9;max-height:70vh;overflow:hidden;word-break:break-all';
  d.textContent = (ok ? 'ALLE TESTS OK ' : `FEHLER (${ergebnis.length}): `) + ergebnis.join(' | ')
    + ' || Querstrich-Messung: ' + (window.querstrich || []).join(' | ');
  document.body.appendChild(d);
})();
