// Testet die Fingerfarben. Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  await startFertig;
  folgeAbspielen = () => Promise.resolve();
  const r = () => canvas.getBoundingClientRect();
  const ev = (typ, x, y) => canvas.dispatchEvent(new PointerEvent(typ, { pointerId: 7, isPrimary: true, clientX: r().left + x, clientY: r().top + y, bubbles: true }));
  const pixel = (p) => {
    const dpr = canvas.width / tafelZustand.breite;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return [...ctx.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data];
  };
  const strichZiehen = () => {
    const pfad = gefuehrt.pfade[0];
    ev('pointerdown', pfad.p[0].x, pfad.p[0].y);
    pfad.p.forEach((q) => ev('pointermove', q.x, q.y));
    ev('pointerup', 0, 0);
    return pfad;
  };
  const farbeWaehlen = (label, farbe) => {
    $('#btn-farbe').click();
    const t = [...document.querySelectorAll('.farbe-tupfer')].find((x) => (farbe ? x.style.background && getComputedStyle(x).backgroundColor === farbe : x.getAttribute('aria-label') === label));
    t.click();
  };
  const l = BUCHSTABEN.findIndex((e) => e.b === 'l');

  // 1. Standard bunt; Farbwahl öffnet 9 Tupfer
  buchstabeOeffnen(l); await warte(100);
  pruefe((zustand.farbe || 'bunt') === 'bunt', 'Standard sollte bunt sein');
  $('#btn-farbe').click();
  pruefe(!$('#farbwahl').hidden && document.querySelectorAll('.farbe-tupfer').length === 9, 'Farbwahl nicht offen');
  $('#btn-farbe').click();
  pruefe($('#farbwahl').hidden, 'Farbwahl schließt nicht');

  // 2. Feste Farbe Blau
  farbeWaehlen(null, 'rgb(61, 143, 209)');
  pruefe(zustand.farbe === '#3d8fd1' && speicher.lesen('farbe') === '#3d8fd1', `Blau nicht gewählt: ${zustand.farbe}`);
  tafelLeeren();
  let pfad = strichZiehen();
  const mitte = pfad.p[Math.floor(pfad.p.length / 2)];
  const blau = pixel(mitte);
  pruefe(Math.abs(blau[0] - 61) < 8 && Math.abs(blau[1] - 143) < 8 && Math.abs(blau[2] - 209) < 8, `Spur nicht blau: ${blau}`);

  // 3. Regenbogen: Anfang und Ende der Spur unterschiedlich gefärbt
  buchstabeOeffnen(l); await warte(100); clearTimeout(tafelZustand.jubelTimer);
  farbeWaehlen('Regenbogen');
  pruefe(zustand.farbe === 'regenbogen', 'Regenbogen nicht gewählt');
  tafelLeeren();
  pfad = strichZiehen();
  const anfang = pixel(pfad.p[3]), ende = pixel(pfad.p[pfad.p.length - 4]);
  pruefe(Math.abs(anfang[0] - ende[0]) + Math.abs(anfang[1] - ende[1]) + Math.abs(anfang[2] - ende[2]) > 60, `Regenbogen ohne Farbwechsel: ${anfang} / ${ende}`);

  // 4. Glitzer: Gold mit weißen Funken
  buchstabeOeffnen(l); await warte(100); clearTimeout(tafelZustand.jubelTimer);
  farbeWaehlen('Glitzer');
  tafelLeeren();
  pfad = strichZiehen();
  const dpr = canvas.width / tafelZustand.breite;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const daten = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let weiss = 0, gold = 0;
  for (let i = 0; i < daten.length; i += 4) {
    if (daten[i + 3] < 200) continue;
    if (daten[i] > 240 && daten[i + 1] > 240 && daten[i + 2] > 240) weiss++;
    else if (daten[i] > 200 && daten[i + 1] > 140 && daten[i + 2] < 60) gold++;
  }
  pruefe(gold > 500 && weiss > 5, `Glitzer: gold=${gold} weiß=${weiss}`);

  // 5. Farbe pro Kind
  window.prompt = () => 'Lina';
  $('#btn-kind-neu').click(); await warte(400);
  const lina = kinder.find((k) => k.name === 'Lina');
  pruefe(lina.farbe === 'glitzer', 'Erstes Kind übernimmt die Farbe nicht');
  window.prompt = () => 'Emil';
  $('#btn-kind-neu').click(); await warte(400);
  const emil = kinder.find((k) => k.name === 'Emil');
  history.back(); await warte(300); history.back(); await warte(300);
  await kindWaehlen(emil.id);
  pruefe(zustand.farbe === 'bunt', 'Emil sollte bunt haben');
  zustand.farbe = '#e0567c'; einstellungenSpeichern(); await warte(100);
  await kindWaehlen(lina.id);
  pruefe(zustand.farbe === 'glitzer', 'Lina hat ihre Farbe verloren');
  pruefe((await datenbank.kinder()).find((k) => k.id === emil.id).farbe === '#e0567c', 'Emils Farbe nicht gespeichert');

  // Ansicht: Farbwahl offen, Glitzer-Spur
  buchstabeOeffnen(l); await warte(100); clearTimeout(tafelZustand.jubelTimer);
  tafelLeeren(); strichZiehen(); clearTimeout(tafelZustand.jubelTimer);
  $('#jubel').classList.remove('zeigen');
  $('#btn-farbe').click();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'FARBEN-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
