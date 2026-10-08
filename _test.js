(function () {
  const ergebnis = [];
  const rect = () => canvas.getBoundingClientRect();
  function ev(typ, x, y) {
    const r = rect();
    canvas.dispatchEvent(new PointerEvent(typ, { pointerId: 7, clientX: r.left + x, clientY: r.top + y, bubbles: true }));
  }
  function test(i, art) {
    zustand.index = i;
    zeigen('trace', false);
    tafelAufbauen();
    const { breite, hoehe } = tafelZustand;
    const w = pruef.spur.width, s = pruef.skala;
    if (art === 'sauber') {
      // Jede Zeile des Buchstabens nachfahren (Strich pro zusammenhängendem Abschnitt)
      for (let y = 0; y < pruef.spur.height; y += 3) {
        let start = -1;
        for (let x = 0; x <= w; x++) {
          const drin = x < w && pruef.ziel[y * w + x];
          if (drin && start < 0) start = x;
          if (!drin && start >= 0) {
            ev('pointerdown', start / s, y / s); ev('pointermove', (x - 1) / s, y / s); ev('pointerup', (x - 1) / s, y / s);
            start = -1;
            if (tafelZustand.geschafft) break;
          }
        }
        if (tafelZustand.geschafft) break;
      }
    } else {
      // Kritzeln quer über die ganze Tafel
      for (let k = 0; k < 6; k++) {
        ev('pointerdown', 10, hoehe * (k / 6)); ev('pointermove', breite - 10, hoehe * ((k + 1) / 6)); ev('pointerup', breite - 10, hoehe * ((k + 1) / 6));
      }
    }
    return tafelZustand.geschafft;
  }
  let ok = true;
  BUCHSTABEN.forEach((e, i) => {
    const a = test(i, 'sauber'), b = test(i, 'kritzeln');
    if (!a || b) { ok = false; ergebnis.push(`${e.b}: ${a} ${b} ${JSON.stringify(tafelZustand.messung)}`); }
  });
  zustand.schreibweise = 'gross';
  BUCHSTABEN.forEach((e, i) => {
    const a = test(i, 'sauber'), b = test(i, 'kritzeln');
    if (!a || b) { ok = false; ergebnis.push(`${e.b.toUpperCase()}: ${a} ${b} ${JSON.stringify(tafelZustand.messung)} size=${tafelZustand.schrift.groesse|0} lw=${tafelZustand.linienbreite|0}`); }
  });
  zustand.schreibweise = 'klein';
  // Für den Screenshot: "m" halb nachgespurt zeigen
  zustand.index = BUCHSTABEN.findIndex((e) => e.b === 'm'); zeigen('trace', false); tafelAufbauen();
  $('#bild').textContent = BUCHSTABEN[zustand.index].bild; $('#fortschritt').textContent = sterneText(1);
  ev('pointerdown', tafelZustand.breite * 0.2, tafelZustand.hoehe * 0.4); ev('pointermove', tafelZustand.breite * 0.22, tafelZustand.hoehe * 0.65); ev('pointerup', 0, 0);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#000c;color:#fff;font:12px monospace;padding:6px;z-index:9';
  d.textContent = (ok ? 'ALLE TESTS OK ' : 'FEHLER: ') + ergebnis.join(' | ');
  document.body.appendChild(d);
})();
