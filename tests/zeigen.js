// Testet „Zeig mir das mmm“ (Drei-Stufen-Lektion). Frisches Browserprofil; App-Timer im Zeitraffer (20×).
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  await startFertig;
  const gespielt = [];
  folgeAbspielen = (folge) => { gespielt.push(folge.map((q) => q.url)); return Promise.resolve(); };
  const echtTimeout = window.setTimeout;
  const pause = (ms) => new Promise((r) => echtTimeout(r, ms));
  window.setTimeout = (fn, ms = 0, ...a) => echtTimeout(fn, ms / 20, ...a);   // Zeitraffer
  const bis = async (fn, ms = 3000) => { const ende = performance.now() + ms; while (!fn() && performance.now() < ende) await pause(10); return fn(); };
  const offen = () => bis(() => !lektion.gesperrt);
  const karten = () => [...document.querySelectorAll('#zeigen-karten .zeigen-karte')];
  const tippe = (btn) => { lektion.letzterTipp = -1e9; btn.click(); };   // Doppeltipp-Schutz zählt ab Seitenstart
  const karteVon = (b) => karten().find((k) => k.getAttribute('aria-label') === b);

  // 1. Auswahl: 3 Buchstaben, nie ähnlich aussehend/klingend; Montessori aus der aktuellen Gruppe
  pruefe(zustand.reihenfolge === 'montessori', 'Neues Gerät nicht Montessori');
  const wahl = zeigenAuswahl();
  pruefe(wahl.length === 3 && wahl.every((b) => 'masl'.includes(b)), `Montessori-Auswahl: ${wahl}`);
  zustand.reihenfolge = 'alphabet';
  for (let i = 0; i < 300; i++) {
    const w = zeigenAuswahl();
    if (w.length !== 3 || !w.every((a, j) => w.slice(j + 1).every((b) => vertraeglich(a, b)))) { fehler.push(`Unverträglich: ${w}`); break; }
  }
  pruefe(!vertraeglich('b', 'd') && !vertraeglich('v', 'f') && !vertraeglich('s', 'ß') && !vertraeglich('m', 'n')
    && !vertraeglich('e', 'f') && !vertraeglich('d', 't') && vertraeglich('m', 'a'), 'vertraeglich()');
  // Jede Montessori-Gruppe ergibt eine volle Lektion
  MONTESSORI_GRUPPEN.forEach((g, i) => {
    zustand.sterne = Object.fromEntries(MONTESSORI_GRUPPEN.slice(0, i).flat().map((b) => [b, 2]));
    const w = zeigenAuswahl();
    pruefe(w.length === 3, `Gruppe ${g.join('')}: ${w}`);
  });
  zustand.sterne = {};
  zustand.reihenfolge = 'montessori';

  // 2. Kachel auf der Startseite (auch im Start-Regal) und Start mit Stufe 1
  pruefe(START_REGAL.includes('zeigen') && !document.querySelector('.spiel-btn[data-spiel="zeigen"]').hidden, 'Kachel fehlt');
  document.querySelector('.spiel-btn[data-spiel="zeigen"]').click();
  pruefe($('#zeigen').classList.contains('active'), 'Spiel nicht geöffnet');
  await offen();
  pruefe(lektion.stufe === 0 && karten().length === 1, 'Stufe 1 zeigt nicht einen Buchstaben');
  pruefe(gespielt.some((f) => f[0] === 'audio/ansage-zeigen-das-ist.wav' && f[1].endsWith('-laut.wav')), 'Keine Ansage „Das ist“ + Laut');

  // 3. Stufe 1: Tippen öffnet die Spur-Tafel mit dem Buchstaben (ohne Verlauf); geschafft → zurück, Buchstabe in die Ablage
  const spurB = lektion.buchstaben[0];
  const verlauf = history.length;
  const sterneVorher = JSON.stringify(zustand.sterne);
  tippe(karten()[0]);
  await bis(() => $('#trace').classList.contains('active'));
  pruefe($('#trace').classList.contains('active') && zustand.lektionSpur && BUCHSTABEN[zustand.index].b === spurB, 'Spur-Tafel nicht geöffnet');
  pruefe(history.length === verlauf, 'Spur-Tafel legt einen Verlaufseintrag an');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // Tafel fertig aufgebaut
  geschafft();
  await bis(() => lektion.schritt === 1);
  pruefe($('#zeigen').classList.contains('active') && !zustand.lektionSpur, 'Nicht zurück in der Lektion');
  pruefe(JSON.stringify(zustand.sterne) === sterneVorher, 'Spuren in der Lektion gibt Sterne');
  pruefe(document.querySelectorAll('.zeigen-feld.voll').length === 1, 'Ablage nicht gefüllt');
  await offen();
  await bis(() => lektion.schritt === 2, 2000);   // nicht tippen: 6 s + 8 s (im Zeitraffer)
  pruefe(lektion.schritt === 2, 'Stufe 1 geht ohne Tipp nicht weiter');
  await offen();
  tippe(karten()[0]);
  // ➡️ auf der Spur-Tafel: ohne Spuren zurück (niemand bleibt hängen)
  await bis(() => $('#trace').classList.contains('active'));
  $('#btn-weiter').click();
  await bis(() => lektion.stufe === 1 && karten().length === 3);
  pruefe(lektion.stufe === 1 && karten().length === 3 && $('#zeigen-ablage').hidden, 'Stufe 2 nicht erreicht');
  const plaetze = karten().map((k) => k.getAttribute('aria-label')).join('');

  // 4. Stufe 2: daneben = kein Punkt, Karte blass; richtig = Punkt; Plätze bleiben fest
  await offen();
  const punkteVorher = lektion.punkte;
  const falsch = karten().find((k) => k.getAttribute('aria-label') !== lektion.ziel);
  tippe(falsch);
  pruefe(falsch.classList.contains('blass') && lektion.punkte === punkteVorher, 'Daneben falsch behandelt');
  await offen();
  pruefe(!falsch.classList.contains('blass'), 'Karte bleibt blass');
  pruefe(gespielt.slice(-1)[0][0] === 'audio/ansage-zeigen-zeig-mir.wav', 'Auftrag nach Daneben nicht wiederholt');
  for (let i = 0; i < 6; i++) {
    await offen();
    const ziel = lektion.ziel;
    tippe(karteVon(ziel));
    await bis(() => lektion.schritt === i + 1 || lektion.stufe === 2);
  }
  pruefe(lektion.stufe === 2, `Stufe 3 nicht erreicht: ${lektion.stufe}/${lektion.schritt}`);
  await bis(() => lektion.auftraege.length === 3);
  pruefe(lektion.auftraege.length === 3, 'Stufe 3 ohne 3 Fragen');

  // 5. Stufe 3: Was ist das? – Tipp = Laut, dann weiter; danach Pokal und Ende ohne Autoplay
  for (let i = 0; i < 3; i++) {
    await offen();
    tippe(karten()[0]);
    await bis(() => lektion.schritt === i + 1 || $('#zeigen-jubel').classList.contains('zeigen'));
  }
  await bis(() => $('#zeigen .spiel-ende') && !$('#zeigen .spiel-ende').hidden);
  const letzterAuftrag = gespielt.map((f) => f[0]).lastIndexOf('audio/ansage-zeigen-zeig-mir.wav');
  const stufe3 = gespielt.slice(letzterAuftrag + 1).map((f) => f[0]);
  pruefe(stufe3.filter((u) => u === 'audio/ansage-zeigen-was-ist-das.wav').length === 3 - lektion.daneben.size, `Fragen in Stufe 3: ${stufe3}`);
  pruefe(lektion.daneben.size === 0 || stufe3.includes('audio/ansage-zeigen-das-ist.wav'), 'Unsicherer Buchstabe nicht nochmal vorgestellt');
  pruefe(lektion.punkte === 12, `Punkte: ${lektion.punkte}`);
  pruefe($('#zeigen .spiel-ende') && !$('#zeigen .spiel-ende').hidden, 'Kein Ende mit 🏠/🔁');

  // 6. Nochmal startet eine neue Lektion; Home stoppt alles
  $('#zeigen .ende-nochmal').click();
  pruefe(lektion.stufe === 0 && lektion.punkte === 0, 'Nochmal startet nicht neu');
  const nr = lektion.nummer;
  $('#btn-zeigen-home').click();
  pruefe(lektion.nummer !== nr && lektion.gesperrt, 'Home stoppt nicht');
  await pause(300);

  // Ansicht: Stufe 2 mit drei Karten
  window.setTimeout = echtTimeout;
  document.querySelector('.spiel-btn[data-spiel="zeigen"]').click();
  await pause(50);
  lektion.stufe = 0; lektion.schritt = 2; lektion.punkte = 2;
  zeigenWeiter(lektion.nummer);
  await pause(1200);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : `ZEIGEN-TESTS OK (Plätze ${plaetze})`;
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
