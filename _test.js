// Abstürze sichtbar machen (rote Leiste mit Fehlermeldung)
window.addEventListener('error', (e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;left:0;right:0;bottom:0;background:#c62828;color:#fff;font:12px monospace;padding:6px;z-index:10">ABSTURZ: ${e.message} (Zeile ${e.lineno})</div>`);
});
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
  // Geführt: Finger entlang eines Strichs ziehen (Anteil von/bis, rückwärts, mit Wackeln)
  function ziehen(nr, { von = 0, bis = 1, rueckwaerts = false, wackeln = 0, abheben = true, aufsetzen = true } = {}) {
    const pfad = gefuehrt.pfade[nr];
    const schritte = Math.ceil(pfad.L / 4);
    const punkte = [];
    for (let k = 0; k <= schritte; k++) {
      let t = von + ((bis - von) * k) / schritte;
      if (rueckwaerts) t = 1 - t;
      const p = punktBei(pfad, t * pfad.L);
      const q = punktBei(pfad, t * pfad.L + 1);
      const n = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const versatz = wackeln * Math.sin(k / 3);
      punkte.push({ x: p.x - ((q.y - p.y) / n) * versatz, y: p.y + ((q.x - p.x) / n) * versatz });
    }
    if (aufsetzen) ev('pointerdown', punkte[0].x, punkte[0].y);
    punkte.forEach((p) => ev('pointermove', p.x, p.y));
    if (abheben) ev('pointerup', punkte[punkte.length - 1].x, punkte[punkte.length - 1].y);
  }
  function gefuehrtTests(i) {
    const n = () => gefuehrt.pfade.length;
    vorbereiten(i);
    test('Vormachen startet beim Öffnen', true, () => !!lauflicht.vormachen && $('#startpunkt').hidden);
    test('Vormachen zeigt alle Striche der Reihe nach', true, () => {
      const besucht = [];
      for (let t = 0; t < 60; t += 0.05) {
        const z = vormachenZustand(t);
        if (!z) break;
        if (besucht[besucht.length - 1] !== z.nr) besucht.push(z.nr);
      }
      return besucht.join() === [...Array(n()).keys()].join() && vormachenZustand(60) === null;
    });
    test('Vormachen endet beim Aufsetzen', true, () => {
      ziehen(0, { bis: 0.1 });
      return lauflicht.vormachen === null && !$('#startpunkt').hidden;
    });
    test('Lichter zeichnen ohne Fehler', true, () => {
      lichterZeichnen(performance.now() + 500);
      lauflicht.vormachen = { start: performance.now() - 300 };
      lichterZeichnen(performance.now());
      lauflicht.vormachen = null;
      return true;
    });
    vorbereiten(i);
    test('geführt: alle Striche', true, () => { for (let k = 0; k < n(); k++) ziehen(k); return tafelZustand.geschafft; });
    vorbereiten(i);
    test('geführt: letzter Strich fehlt', false, () => { for (let k = 0; k < n() - 1; k++) ziehen(k); return tafelZustand.geschafft; });
    vorbereiten(i);
    test('geführt: erster Strich rückwärts zählt nicht', 0, () => { ziehen(0, { rueckwaerts: true }); return gefuehrt.nr; });
    vorbereiten(i);
    test('geführt: absetzen und weitermachen', true, () => {
      for (let k = 0; k < n(); k++) { ziehen(k, { bis: 0.5 }); ziehen(k, { von: 0.5 }); }
      return tafelZustand.geschafft;
    });
    vorbereiten(i);
    test('geführt: wackelig', true, () => {
      for (let k = 0; k < n(); k++) ziehen(k, { wackeln: spurToleranz() * 0.8 });
      return tafelZustand.geschafft;
    });
    vorbereiten(i);
    test('geführt: abgerutscht zählt nicht', true, () => {
      ziehen(0, { bis: 0.4 });
      const vorher = gefuehrt.fortschritt;
      ziehen(0, { von: 0.4, bis: 0.6, abheben: false });
      ev('pointermove', 5, 5);                     // weit weg gerutscht
      ev('pointerup', 5, 5);
      return Math.abs(gefuehrt.fortschritt - vorher) < 1 && gefuehrt.nr === 0;
    });
    // Strich darf nicht vor seinem Ende fertig sein (z. B. Hakenende beim j)
    vorbereiten(i);
    const ersterLang = gefuehrt.pfade.findIndex((p) => p.L > gefuehrt.breite * 3);
    if (ersterLang === 0) {
      test('geführt: bei 92 % noch nicht fertig', 0, () => { ziehen(0, { bis: 0.92 }); return gefuehrt.nr; });
    }
    // Hängender Fingerkontakt (kein pointerup) darf weitere Tipps nicht blockieren
    vorbereiten(i);
    test('geführt: hängender Kontakt blockiert nicht', true, () => {
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 99, isPrimary: true, clientX: r.left + 3, clientY: r.top + 3, bubbles: true }));
      // kein pointerup für 99 – jetzt normal zeichnen (neuer erster Finger)
      for (let k = 0; k < n(); k++) {
        const p = gefuehrt.pfade[k];
        canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 200 + k, isPrimary: true, clientX: r.left + p.p[0].x, clientY: r.top + p.p[0].y, bubbles: true }));
        p.p.forEach((q) => canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 200 + k, isPrimary: true, clientX: r.left + q.x, clientY: r.top + q.y, bubbles: true })));
        canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 200 + k, isPrimary: true, clientX: r.left + p.p[p.p.length - 1].x, clientY: r.top + p.p[p.p.length - 1].y, bubbles: true }));
      }
      return tafelZustand.geschafft;
    });
    // Punkte (i, j, Umlaute) nur antippen
    vorbereiten(i);
    if (gefuehrt.pfade.some((p) => p.L <= gefuehrt.breite * 0.6)) {
      test('geführt: Punkte antippen', true, () => {
        gefuehrt.pfade.forEach((p, k) => {
          if (p.L <= gefuehrt.breite * 0.6) { ev('pointerdown', p.p[0].x, p.p[0].y); ev('pointerup', p.p[0].x, p.p[0].y); }
          else ziehen(k);
        });
        return tafelZustand.geschafft;
      });
    }
    // Wo ein Strich dort beginnt, wo der vorige endet: ohne Absetzen weiterziehen
    vorbereiten(i);
    const verbunden = (k) => k + 1 < n() && Math.hypot(
      gefuehrt.pfade[k].p[gefuehrt.pfade[k].p.length - 1].x - gefuehrt.pfade[k + 1].p[0].x,
      gefuehrt.pfade[k].p[gefuehrt.pfade[k].p.length - 1].y - gefuehrt.pfade[k + 1].p[0].y) <= fangRadius();
    if ([...Array(n()).keys()].some(verbunden)) {
      test('geführt: ohne Absetzen weiterziehen', true, () => {
        for (let k = 0; k < n(); k++) ziehen(k, { aufsetzen: !(k > 0 && verbunden(k - 1)), abheben: !verbunden(k) });
        return tafelZustand.geschafft;
      });
      window.verbundeneBuchstaben = (window.verbundeneBuchstaben || []).concat(text());
    }
    if (text() === 'a') {
      vorbereiten(i);
      test('geführt: halber Bauch, dann Strich', false, () => { ziehen(0, { bis: 0.5 }); ziehen(1); return tafelZustand.geschafft; });
    }
  }
  function test(name, erwartet, ausfuehren) {
    const ist = ausfuehren();
    if (ist !== erwartet) ergebnis.push(`${text()} ${name}: ${ist} ${kurz(tafelZustand.messung)}`);
  }

  for (const schreibweise of ['klein', 'gross']) {
    zustand.schreibweise = schreibweise;
    BUCHSTABEN.forEach((e, i) => {
      vorbereiten(i);
      if (gefuehrt.aktiv) { gefuehrtTests(i); return; }
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
      if (gefuehrt.aktiv) continue;
      test('ohne Querstrich', false, () => nachfahren(pruef.ziel, (x0, x1) => x1 - x0 < 2.2 * pruef.strichbreite));
      window.querstrich = (window.querstrich || []).concat(`${text()}: ${kurz(tafelZustand.messung)}`);
    }
    // Wie ein Kind: zwei Striche entlang der Beine (A: Schrägen, H: Senkrechte), ohne bzw. mit Querstrich
    for (const b of schreibweise === 'gross' ? ['a', 'h'] : []) {
      const i = BUCHSTABEN.findIndex((e) => e.b === b);
      vorbereiten(i);
      if (gefuehrt.aktiv) continue;
      const { links, rechts, quer } = beine();
      test('Kind: nur Beine', false, () => { strich(links); strich(rechts); echtesPruefen(); return tafelZustand.geschafft; });
      window.querstrich.push(`${text()} nur Beine: ${kurz(tafelZustand.messung)}`);
      vorbereiten(i);
      test('Kind: Beine + Querstrich', true, () => { strich(links); strich(rechts); strich(quer); echtesPruefen(); return tafelZustand.geschafft; });
    }
  }

  // Für den Screenshot: Buchstabe aus #a, #m, #A, #H (Standard A), erster Strich fertig, zweiter halb
  const zeigeB = decodeURIComponent(location.hash.slice(1)) || 'A';
  zustand.schreibweise = zeigeB === zeigeB.toUpperCase() ? 'gross' : 'klein';
  zustand.index = BUCHSTABEN.findIndex((e) => e.b === zeigeB.toLowerCase()); zeigen('trace', false); tafelAufbauen();
  $('#bild').innerHTML = bildHtml(BUCHSTABEN[zustand.index]); $('#fortschritt').textContent = sterneText(1);
  // ?demo=0.8 -> Vormachen nach 0,8 s einfrieren; sonst erster Strich fertig, zweiter halb, Lauflicht eingefroren
  const demo = new URLSearchParams(location.search).get('demo');
  if (gefuehrt.aktiv && demo) {
    lauflicht.eingefroren = true;
    lauflicht.vormachen = { start: 0 };
    vorlageZeichnen();
    lichterZeichnen(parseFloat(demo) * 1000);
  } else if (gefuehrt.aktiv) {
    ziehen(0); ziehen(1, { bis: 0.4 });
    lauflicht.eingefroren = true;
    lauflicht.zyklusStart = 0;
    const pfad = gefuehrt.pfade[gefuehrt.nr];
    // Licht hat gerade 60 % des restlichen Strichs erreicht (bei Buchstaben, die schon fertig sind, entfällt das)
    if (pfad) lichterZeichnen(((pfad.L - gefuehrt.fortschritt) * 0.6 / lichtTempo()) * 1000);
  }
  const ok = ergebnis.length === 0;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:' + (ok ? '#1b7f3a' : '#c62828') + ';color:#fff;font:11px monospace;padding:6px;z-index:9;max-height:70vh;overflow:hidden;word-break:break-all';
  d.textContent = (ok ? 'ALLE TESTS OK ' : `FEHLER (${ergebnis.length}): `) + ergebnis.join(' | ')
    + ` || ${BUCHSTABEN.length * 2} Zeichen geführt geprüft; ohne Absetzen: ${(window.verbundeneBuchstaben || []).join(' ')}`;
  document.body.appendChild(d);
})();
