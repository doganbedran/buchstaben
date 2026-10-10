// Testet „Menschen“: Foto der Person, Hauptstimme je Kind, Gäste beim Lob (fest beim Anfangsbuchstaben, „O“ wie Oma),
// kleines Foto des Gastes, Sicherung und Löschen. Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  await startFertig;
  folgeAbspielen = () => Promise.resolve();
  window.confirm = () => true;
  const bild = await new Promise((r) => { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#7a4fd0'; g.fillRect(0, 0, 8, 8); c.toBlob(r, 'image/png'); });
  const ton = (t) => new Blob([t], { type: 'audio/webm' });

  // 1. Mama (Hauptstimme), Oma (Lob + Foto), Papa (ohne Lob); Kind Lina hört Mama
  await datenbank.profilSpeichern({ id: 'p-mama', name: 'Mama', erstellt: 1 });
  await datenbank.profilSpeichern({ id: 'p-oma', name: 'Oma', erstellt: 2 });
  await datenbank.profilSpeichern({ id: 'p-papa', name: 'Papa', erstellt: 3 });
  await datenbank.medienSetzen('p-mama', 'lob-1', 'stimme', ton('mama-lob'));
  await datenbank.medienSetzen('p-oma', 'lob-1', 'stimme', ton('oma-lob'));
  await datenbank.medienSetzen('p-oma', 'ich', 'bild', bild);
  pruefe(MEDIEN_SCHLUESSEL.test('p-oma|ich|bild'), 'Foto der Person nicht sicherbar');
  await datenbank.kindSpeichern({ id: 'k-lina', name: 'Lina', tier: '🦊', foto: null, nameStimme: null, schreibweise: 'klein',
    sterne: {}, profil: 'p-mama', erstellt: 1 });
  await kinderLaden();
  await kindWaehlen('k-lina');
  pruefe(zustand.profil === 'p-mama' && !gastLob.length, 'Start: Hauptstimme Mama ohne Gäste');

  // 2. Kind bearbeiten: Gäste-Karte mit Oma (lobt beim „o“) und Papa (ohne Lob, nicht wählbar)
  kindBearbeiten('k-lina');
  await pause(500);
  const zeilen = [...document.querySelectorAll('#kind-gaeste .profil-zeile')];
  const zeile = (name) => zeilen.find((z) => z.textContent.includes(name));
  pruefe(zeilen.length === 2 && !$('#kind-gaeste-karte').hidden, `Gäste-Zeilen: ${zeilen.length}`);
  pruefe(zeile('Oma') && zeile('Oma').textContent.includes('lobt beim „O“') && !zeile('Oma').querySelector('input').disabled, 'Oma nicht wählbar');
  pruefe(zeile('Oma').querySelector('.mensch-bild img'), 'Omas Foto fehlt in der Liste');
  pruefe(zeile('Papa') && zeile('Papa').querySelector('input').disabled && zeile('Papa').textContent.includes('kein Lob'), 'Papa ohne Lob wählbar');
  zeile('Oma').querySelector('input').click();
  await pause(600);
  pruefe((kinder.find((k) => k.id === 'k-lina').lobGaeste || []).join() === 'p-oma', 'Gast nicht gespeichert');
  pruefe(gastLob.length === 1 && gastLob[0].b === 'o' && gastLob[0].fotoUrl, `Gast nicht geladen: ${JSON.stringify(gastLob)}`);
  pruefe(document.querySelectorAll('#kind-gaeste .profil-zeile').length === 2, 'Gäste-Zeilen doppelt');

  // 3. Lob: beim „o“ lobt Oma (mit Foto), sonst die Hauptstimme
  const text = async (q) => (await fetch(q.url)).text();
  const o = lobQuelle('o');
  pruefe(o.gast === 'p-oma' && (await text(o)) === 'oma-lob', 'Beim „o“ lobt nicht Oma');
  pruefe(!$('#sprecher').classList.contains('zeigen'), 'Foto schon vor dem Abspielen');
  pruefe(o.sprecher && o.sprecher.fotoUrl, 'Gast-Lob ohne Foto-Angabe');
  sprecherZeigen(o.sprecher);
  pruefe($('#sprecher').classList.contains('zeigen') && $('#sprecher img'), 'Kein Foto des Gastes');
  // Nach Omas Lob nie Mamas Aufnahme des Namens (zwei Stimmen in einem Satz)
  await kindAendern((k) => { k.nameStimme = ton('lina'); });
  await kindWaehlen('k-lina');
  for (let i = 0; i < 20; i++) pruefe(lobMitName('o').length === 1, 'Name nach Gast-Lob');
  // Probehören im Elternbereich für ein anderes Kind: kein Gast des aktiven Kindes
  pruefe(!wiedergabeFolge(BUCHSTABEN.find((e) => e.b === 'o'), true, { name: 'Anderes' })[0].gast, 'Gast beim Probehören eines anderen Kindes');
  // Bearbeitetes Profil im Elternbereich ist Oma: trotzdem bleibt Oma Gast (Filter auf die Hauptstimme des Kindes)
  zustand.profil = 'p-oma';
  await gastLobLaden();
  pruefe(gastLob.length === 1, 'Gast fällt weg, wenn er im Elternbereich bearbeitet wird');
  zustand.profil = 'p-mama';
  // Zwei Ladeläufe gleichzeitig: Gast nicht doppelt
  await Promise.all([gastLobLaden(), gastLobLaden()]);
  pruefe(gastLob.length === 1, `Gäste doppelt: ${gastLob.length}`);
  const m = lobQuelle('m');
  pruefe(!m.gast && (await text(m)) === 'mama-lob', 'Beim „m“ nicht die Hauptstimme');
  pruefe(!lobQuelle().gast, 'Ohne Buchstabe lobt ein Gast');
  const folge = wiedergabeFolge(BUCHSTABEN.find((e) => e.b === 'o'), true, aktivesKind());
  pruefe(folge[0].gast === 'p-oma', 'Nachspuren „o“: kein Gast-Lob');
  pruefe(lobMitName('o')[0].gast === 'p-oma', 'lobMitName ohne Gast');
  // Wer Hauptstimme ist, ist kein Gast mehr
  await kindAendern((k) => { k.profil = 'p-oma'; k.lobGaeste = (k.lobGaeste || []).filter((id) => id !== 'p-oma'); });
  await kindWaehlen('k-lina');
  pruefe(!gastLob.length, 'Hauptstimme zugleich Gast');
  await kindAendern((k) => { k.profil = 'p-mama'; k.lobGaeste = ['p-oma']; });
  await kindWaehlen('k-lina');

  // 4. Sicherung: Gäste am Kind bleiben, Fremdes fällt heraus
  const sauber = kindSauber({ id: 'k-x', name: 'x', lobGaeste: ['p-oma', '<script>', 'standard', 5] });
  pruefe(sauber.lobGaeste.join() === 'p-oma', `Sicherung Gäste: ${sauber.lobGaeste}`);
  const s = await sicherungErstellen();
  pruefe(s.kinder.find((k) => k.id === 'k-lina').lobGaeste.join() === 'p-oma', 'Gäste fehlen in der Sicherung');
  pruefe(s.profile.find((p) => p.id === 'p-oma').medien.some((x) => x.schluessel === 'p-oma|ich|bild'), 'Foto der Person fehlt in der Sicherung');

  // 5. Neuer Mensch: fragt bei einem Kind mit eigener Stimme nach der Hauptstimme (nicht still umstellen)
  let frage = '';
  window.confirm = (t) => { frage = t; return false; };
  window.prompt = () => 'Opa';
  await profilNeu();
  pruefe(frage.includes('Hauptstimme') && kinder.find((k) => k.id === 'k-lina').profil === 'p-mama', 'Neuer Mensch stellt die Hauptstimme still um');
  const opa = (await datenbank.profile()).find((p) => p.name === 'Opa');
  pruefe(kinder.find((k) => k.id === 'k-lina').lobGaeste.includes(opa.id), '„Nur ab und zu loben“ nicht angehakt');
  elternZeichnen(); await pause(500);
  pruefe(!$('#mensch-stand').hidden && $('#mensch-stand').textContent.includes('lobt ab und zu Lina'), `Stand: ${$('#mensch-stand').textContent}`);
  window.confirm = () => true;

  // 6. Oma löschen: verschwindet aus den Gästen
  await profilAktivieren('p-oma');
  $('#btn-profil-loeschen').click();
  await pause(800);
  pruefe(!(kinder.find((k) => k.id === 'k-lina').lobGaeste || []).includes('p-oma'), 'Gelöschter Mensch bleibt Gast');

  // Ansicht: Kind bearbeiten, Karten „Wer spricht?“ und Gäste
  await datenbank.profilSpeichern({ id: 'p-oma', name: 'Oma', erstellt: 2 });
  await datenbank.medienSetzen('p-oma', 'lob-1', 'stimme', ton('oma-lob'));
  await datenbank.medienSetzen('p-oma', 'ich', 'bild', bild);
  await kinderLaden();
  kindBearbeiten('k-lina');
  await pause(500);
  $('#kind-profile').scrollIntoView();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'MENSCHEN OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
