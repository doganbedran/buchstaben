// Testet das Memory "Groß und klein".
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  folgeAbspielen = () => Promise.resolve();

  // 1. Auswahl: nie Buchstaben mit gleicher Form, immer 4 Paare aus groß + klein
  for (let n = 0; n < 500; n++) {
    memoryNeu();
    const bs = memory.karten.map((k) => k.b);
    const ok = memory.karten.length === 8 && new Set(bs).size === 4
      && [...new Set(bs)].every((b) => memory.karten.some((k) => k.z === b) && memory.karten.some((k) => k.z === grossVon(b)))
      && !bs.some((b) => 'coöswvxzß'.includes(b)) && !(bs.includes('i') && bs.includes('l'));
    if (!ok) { fehler.push(`Auswahl falsch: ${memory.karten.map((k) => k.z).join('')}`); break; }
  }

  // 2. Spiel über die Leiste starten
  document.querySelector('.spiel-btn[data-spiel="memory"]').click();
  pruefe($('#memory').classList.contains('active') && document.querySelectorAll('.memory-karte').length === 8, 'Memory nicht geöffnet');

  // 3. Kein Paar: beide offen, gesperrt, danach wieder zu
  const k = memory.karten;
  const a = k[0], nichtPaar = k.find((x) => x.b !== a.b);
  memoryKarteGetippt(a.i); memoryKarteGetippt(nichtPaar.i);
  pruefe(memory.offen.length === 2 && memory.gesperrt, 'Zwei offene Karten nicht gesperrt');
  memoryKarteGetippt(k.find((x) => x !== a && x !== nichtPaar).i);
  pruefe(memory.offen.length === 2, 'Dritte Karte trotz Sperre geöffnet');
  clearTimeout(memory.timer); memoryZurueckdrehen();
  pruefe(memory.offen.length === 0 && memory.gefunden === 0, 'Nicht zurückgedreht');

  // 4. Gleiche Karte zweimal zählt nicht als Paar
  memoryKarteGetippt(a.i); memoryKarteGetippt(a.i);
  pruefe(memory.offen.length === 1 && memory.gefunden === 0, 'Gleiche Karte zweimal');
  clearTimeout(memory.timer); memoryZurueckdrehen();

  // 5. Alle Paare finden
  for (const b of [...new Set(k.map((x) => x.b))]) {
    const [x, y] = k.filter((z) => z.b === b);
    memoryKarteGetippt(x.i); memoryKarteGetippt(y.i);
  }
  pruefe(memory.gefunden === 4 && k.every((x) => x.paar), 'Nicht alle Paare gefunden');
  pruefe($('#memory-jubel').classList.contains('zeigen'), 'Kein Jubel am Ende');
  clearTimeout(memory.timer); clearTimeout(memory.timerNeu);

  // Screenshot: neues Spiel, ein Paar gefunden, eine Karte offen
  $('#memory-jubel').classList.remove('zeigen');
  memoryNeu();
  const [p1, p2] = memory.karten.filter((z) => z.b === memory.karten[0].b);
  memoryKarteGetippt(p1.i); memoryKarteGetippt(p2.i);
  memoryKarteGetippt(memory.karten.find((z) => !z.paar).i);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'MEMORY-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
