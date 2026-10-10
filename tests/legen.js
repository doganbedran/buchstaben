// Testet "Wörter legen". Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  const gespielt = [];
  folgeAbspielen = (folge) => { gespielt.push(folge.map((q) => q.url)); return Promise.resolve(); };

  // 1. Wortauswahl: nur lautgetreue, kurze Wörter
  const woerter = legenWoerter().map((w) => w.wort);
  pruefe(woerter.length >= 15, `Zu wenige Wörter: ${woerter.length}`);
  pruefe(['Lama', 'Sofa', 'Wal', 'Igel'].every((w) => woerter.includes(w)), `Erwartete Wörter fehlen: ${woerter}`);
  pruefe(!['Maus', 'Uhr', 'Kuh', 'Fisch', 'Zebra', 'Fuß'].some((w) => woerter.includes(w)), `Ungeeignete Wörter: ${woerter}`);

  // 2. Start
  document.querySelector('.spiel-btn[data-spiel="legen"]').click();
  pruefe($('#legen').classList.contains('active'), 'Spiel nicht geöffnet');
  const n = legen.buchstaben.length;
  pruefe(document.querySelectorAll('.legen-feld').length === n && document.querySelectorAll('.legen-stein').length === n + 2, 'Felder/Steine falsch');
  pruefe(legen.buchstaben.every((b) => legen.steine.filter((s) => s.b === b).length >= legen.buchstaben.filter((x) => x === b).length), 'Steine reichen nicht für das Wort');

  // 3. Falscher Stein bleibt liegen
  const steinBtn = (st) => document.querySelectorAll('.legen-stein')[legen.steine.indexOf(st)];
  const falsch = legen.steine.find((s) => s.b !== legen.buchstaben[0]);
  steinBtn(falsch).click();
  pruefe(legen.pos === 0 && !falsch.weg, 'Falscher Stein wurde gelegt');
  pruefe(!document.querySelector('.legen-stein.hinweis'), 'Hinweis schon nach einem Fehler');
  steinBtn(falsch).click();
  pruefe(document.querySelectorAll('.legen-stein.hinweis').length === 1, 'Kein Hinweis nach zwei Fehlversuchen');

  // 4. Drei Wörter richtig legen
  for (let runde = 1; runde <= LEGEN_RUNDEN; runde++) {
    for (let i = 0; i < legen.buchstaben.length; i++) {
      const st = legen.steine.find((s) => !s.weg && s.b === legen.buchstaben[legen.pos]);
      steinBtn(st).click();
    }
    pruefe(legen.runde === runde && legen.pos === legen.buchstaben.length, `Runde ${runde} nicht fertig`);
    clearTimeout(legen.timer);
    if (runde < LEGEN_RUNDEN) legenNeuesWort();
  }
  pruefe(legen.runde === LEGEN_RUNDEN, 'Nicht alle Runden');

  // 5. Schreibweise: GROSS
  zustand.schreibweise = 'gross';
  legenNeuesWort();
  pruefe(document.querySelector('.legen-stein').getAttribute('aria-label') === legen.steine[0].b, 'Stein-Beschriftung');
  pruefe(legenZeichen('a') === 'A', 'Großschreibung');
  zustand.schreibweise = 'klein';

  // Ansicht: neues Wort, zwei Buchstaben gelegt
  legen.runde = 1; legenNeuesWort();
  for (let i = 0; i < 2; i++) steinBtn(legen.steine.find((s) => !s.weg && s.b === legen.buchstaben[legen.pos])).click();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : `LEGEN-TESTS OK (${woerter.length} Wörter)`;
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
