// Testet „Mitmachen von außen“: Einladungslink, Mitmach-Seite (nichts gespeichert), Stimm-Paket erstellen, prüfen
// (manipulierte Pakete), Vorschau und Übernehmen als neuer Mensch mit Lob, Foto, „Meine Leute“ und Gast beim Kind.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  await startFertig;
  folgeAbspielen = () => Promise.resolve();
  const meldungen = [];
  window.alert = (t) => meldungen.push(t);
  const bild = await new Promise((r) => { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#d0654f'; g.fillRect(0, 0, 8, 8); c.toBlob(r, 'image/jpeg'); });
  const ton = (t) => new Blob([t], { type: 'audio/webm' });

  // 1. Einladungslink und Erkennen beim Start
  const link = einladungsLink('Oma Gül');
  pruefe(link.endsWith('#mitmachen=Oma%20G%C3%BCl') && link.startsWith(location.origin), `Link: ${link}`);
  pruefe(mitmachName('#mitmachen=Oma%20G%C3%BCl') === 'Oma Gül' && mitmachName('#mitmachen') === '' && mitmachName('#eltern') === null
    && mitmachName('#mitmachen=%E0%A4%A') === '', 'Link wird falsch gelesen');
  pruefe(mitmachName('#mitmachen=' + 'x'.repeat(100)).length === 30, 'Name im Link nicht gekürzt');
  pruefe(mitmachName('#mitmachen=' + encodeURIComponent('O\u202Ema\u200B')) === 'Oma', 'Steuerzeichen im Namen bleiben');

  // 2. Mitmach-Seite: Name vorbelegt, Schicken erst mit Lob, nichts landet in der Datenbank
  const vorher = { profile: (await datenbank.profile()).length, medien: (await datenbank.alleMedien()).length };
  mitmachenStarten('Oma');
  pruefe($('#mitmachen').classList.contains('active') && $('#mitmachen-name').value === 'Oma', 'Mitmach-Seite nicht offen');
  pruefe($('#btn-mitmachen-schicken').disabled && document.querySelectorAll('#mitmachen-lob .lob-zeile').length === 5, 'Schicken ohne Lob möglich');
  mitmach.lob[0] = ton('oma-super');
  mitmach.lob[2] = ton('oma-toll');
  mitmach.nameStimme = ton('oma-name');
  mitmach.foto = bild;
  mitmachZeichnen();
  pruefe(!$('#btn-mitmachen-schicken').disabled && $('#mitmachen-stand').textContent.includes('2 Lob'), `Stand: ${$('#mitmachen-stand').textContent}`);
  const inhalt = await paketErstellen();
  pruefe(inhalt.format === PAKET_FORMAT && inhalt.name === 'Oma' && inhalt.lob.length === 2 && inhalt.foto && inhalt.nameStimme, 'Paket unvollständig');
  pruefe(Object.keys(inhalt).sort().join() === 'erstellt,format,foto,lob,name,nameStimme,version', `Paket enthält mehr: ${Object.keys(inhalt)}`);
  pruefe($('#mitmachen-danke').hidden && $('#btn-mitmachen-schicken').textContent.includes('Paket schicken'), 'Danke vor dem Schicken');
  mitmach.verschickt = true; mitmachZeichnen();
  pruefe(!$('#mitmachen-danke').hidden && $('#btn-mitmachen-schicken').textContent.includes('Nochmal'), 'Kein Danke nach dem Schicken');
  pruefe(!document.querySelector('#mitmachen-lob [aria-label="Löschen"]'), 'Löschen-Knopf direkt neben ▶️');
  pruefe(document.querySelector('#mitmachen-lob .mini-btn').getBoundingClientRect().width >= 56, 'Knöpfe zu klein für Großeltern');
  mitmach.verschickt = false;
  pruefe((await datenbank.profile()).length === vorher.profile && (await datenbank.alleMedien()).length === vorher.medien, 'Mitmachen speichert etwas');

  // 3. Manipulierte Pakete: kein Code, keine fremden Adressen, kein SVG als Foto
  let abgelehnt = false;
  try { await paketPruefen({ format: 'buchstaben-sicherung' }); } catch { abgelehnt = true; }
  pruefe(abgelehnt, 'Fremdes Format angenommen');
  abgelehnt = false;
  try { await paketPruefen({ format: PAKET_FORMAT, name: 'x', lob: ['https://boese.example/a.wav'] }); } catch { abgelehnt = true; }
  pruefe(abgelehnt, 'Paket ohne gültige Aufnahme angenommen');
  const boese = await paketPruefen({ format: PAKET_FORMAT, name: '<img src=x onerror="window.__angriff=1">' + 'y'.repeat(50),
    foto: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', nameStimme: 'data:text/html;base64,PGI+', lob: [...Array(9)].map(() => inhalt.lob[0]) });
  pruefe(boese.name.length === 30 && !boese.foto && !boese.nameStimme && boese.lob.length === 5, 'Manipuliertes Paket nicht gesäubert');
  await paketOeffnen({ format: PAKET_FORMAT, name: '<img src=x onerror="window.__angriff=1">', lob: [inhalt.lob[0]] });
  await pause(300);
  pruefe(!window.__angriff && $('#paket-name').textContent.includes('<img'), 'Code im Namen ausgeführt');
  history.back(); await pause(300);

  // 4. Echtes Paket: Vorschau mit Foto und drei ▶️, dann Übernehmen → neuer Mensch, Gast bei Lina
  await datenbank.kindSpeichern({ id: 'k-lina', name: 'Lina', tier: '🦊', foto: null, nameStimme: null, schreibweise: 'klein', sterne: {}, profil: 'standard', erstellt: 1 });
  await kinderLaden();
  await kindWaehlen('k-lina');
  await elternOeffnen();
  await paketOeffnen(inhalt);
  pruefe($('#paket').classList.contains('active') && $('#paket-foto img') && document.querySelectorAll('#paket-teile button').length === 3, 'Vorschau unvollständig');
  let frage = '';
  window.confirm = (t) => { frage = t; return true; };
  $('#btn-paket-ok').click();
  await pause(1200);
  const oma = (await datenbank.profile()).find((p) => p.name === 'Oma');
  pruefe(oma && /^p-[a-z0-9]+$/.test(oma.id), 'Kein neuer Mensch');
  const schl = (await datenbank.medienVon(oma.id)).map((m) => m.schluessel.split('|').slice(1).join('|')).sort();
  pruefe(schl.includes('lob-1|stimme') && schl.includes('lob-2|stimme') && schl.includes('ich|bild'), `Medien: ${schl}`);
  pruefe(oma.kistenWoerter.length === 1 && oma.kistenWoerter[0].wort === 'Oma' && oma.kistenWoerter[0].name, 'Nicht in „Meine Leute“');
  pruefe(schl.includes(`w-${oma.kistenWoerter[0].id}|bild`) && schl.includes(`w-${oma.kistenWoerter[0].id}|stimme`), 'Meine Leute ohne Foto/Name');
  pruefe(frage.includes('Lina') && frage.includes('„O“'), `Rückfrage: ${frage}`);
  const lina = kinder.find((k) => k.id === 'k-lina');
  pruefe(lina.profil === 'standard' && lina.lobGaeste.includes(oma.id), 'Kind falsch geändert');
  pruefe($('#eltern').classList.contains('active') && zustand.profil === oma.id, 'Nach dem Übernehmen nicht bei Oma im Elternbereich');
  // Zweimal dasselbe Paket: zwei getrennte Menschen, nichts überschrieben
  await paketOeffnen(inhalt);
  window.confirm = () => false;
  $('#btn-paket-ok').click();
  await pause(1200);
  pruefe((await datenbank.profile()).filter((p) => p.name === 'Oma').length === 2, 'Zweites Paket überschreibt das erste');
  // Drittes Paket, „ersetzen“ gewählt: kein dritter Mensch, Lob ersetzt (ein Satz statt zwei), Meine Leute nicht doppelt
  window.confirm = (t) => t.includes('gibt es schon');
  await paketOeffnen({ ...inhalt, lob: [inhalt.lob[1]] });
  $('#btn-paket-ok').click();
  await pause(1200);
  const omas = (await datenbank.profile()).filter((p) => p.name === 'Oma');
  pruefe(omas.length === 2, `Ersetzen legt neuen Menschen an: ${omas.length}`);
  const ersetzt = omas.find((p) => p.id === oma.id);
  const lobJetzt = (await datenbank.medienVon(oma.id)).filter((m) => /\|lob-\d\|stimme$/.test(m.schluessel)).length;
  pruefe(lobJetzt === 1 && ersetzt.kistenWoerter.length === 1, `Ersetzen: Lob ${lobJetzt}, Meine Leute ${ersetzt.kistenWoerter.length}`);
  pruefe(meldungen.some((t) => t.includes('Oma ist jetzt dabei')), 'Keine Bestätigung nach dem Übernehmen');
  window.confirm = () => true;

  // Ansicht: Mitmach-Seite wie bei Oma
  mitmachenStarten('Oma');
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'MITMACHEN OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
