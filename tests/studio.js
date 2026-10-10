// Testet „Stimme einsprechen“ im Elternbereich (ohne Mikrofon: ein künstlicher Ton ersetzt die Aufnahme). Frisches Profil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  await startFertig;
  window.confirm = () => true;
  window.prompt = () => 'Papa';
  const gespielt = [];
  abspielen = (url) => { gespielt.push(url); return Promise.resolve(); };
  const ton = (sek, an) => new Float32Array(Math.round(22050 * sek)).map((_, i) => (an ? Math.sin(i / 8) * 0.5 : 0));
  const sprechen = async (sek = 0.4) => { await studioVerarbeiten(studioWav(ton(0.25, false), ton(sek, true), ton(0.25, false))); };

  // 1. Standard-Profil: kein Studio; eigenes Profil: Knopf im Elternbereich, Hinweis beim ersten Mal
  await elternOeffnen();
  await profilNeu(); await warte(400);
  pruefe(zustand.profil !== STANDARD.id, 'Profil nicht angelegt');
  const knopf = $('#anpassen [data-a=studio]');
  pruefe(knopf, 'Knopf „Stimme einsprechen“ fehlt');
  knopf.click(); await warte(300);
  pruefe($('#studio').classList.contains('active') && !$('#studio-hinweis').hidden, 'Studio/Hinweis nicht offen');
  $('#btn-studio-ok').click();
  pruefe($('#studio-hinweis').hidden && speicher.lesen('studioHinweis') === true, 'Hinweis nicht gemerkt');
  pruefe(studio.bereich === 'laute' && studio.pos === 0 && $('#studio-text').textContent === 'A a', `Start: ${$('#studio-text').textContent}`);

  // 2. Stille = keine Aufnahme
  await studioVerarbeiten(studioWav(ton(0.6, false)));
  pruefe(!studio.aufnahme && $('#studio-meldung').textContent.includes('Nichts gehört'), 'Stille nicht erkannt');

  // 3. Laut "aufnehmen": Stille weg, doppelt ("a … a"), Vorschau spielt die neue Aufnahme
  gespielt.length = 0;
  await sprechen(0.4);
  pruefe(studio.aufnahme && !$('#btn-studio-gut').disabled, 'Keine Aufnahme');
  const sek = (studio.aufnahme.size - 44) / 2 / 22050;
  pruefe(sek > 1.1 && sek < 1.5, `Laut-Länge ${sek.toFixed(2)} s (erwartet ≈ 2 × 0,55 + 0,35)`);
  await warte(50);
  pruefe(gespielt.some((u) => u.startsWith('blob:')), 'Vorschau spielt nicht die Aufnahme');

  // 4. Speichern: in DB und im Speicher, weiter zum nächsten offenen Stück; Spiele nutzen jetzt die eigene Datei
  await studioSpeichern();
  pruefe((await datenbank.medienVon(zustand.profil)).some((m) => m.schluessel.endsWith('|datei:a-laut.wav|stimme')), 'Nicht in der Datenbank');
  pruefe(studio.pos === 1 && $('#studio-text').textContent === 'B b', 'Nicht zum nächsten Laut');
  pruefe(eigeneDatei('audio/a-laut.wav') && !eigeneDatei('audio/b-laut.wav'), 'eigeneDatei()');
  const a = BUCHSTABEN[0];
  pruefe(hauptWahl(a).ansage().map((q) => q.url).join() === 'audio/a-laut.wav,audio/a-wort.wav', `Ansage aus Teilen: ${hauptWahl(a).ansage().map((q) => q.url)}`);
  pruefe(hauptWahl(BUCHSTABEN[1]).ansage()[0].url === 'audio/b.wav', 'Ohne eigene Teile: ganzer Standard-Clip');
  gespielt.length = 0;
  await folgeAbspielen([{ url: 'audio/a-laut.wav' }, { url: 'audio/b-laut.wav' }]);
  pruefe(gespielt[0].startsWith('blob:') && gespielt[1] === 'audio/b-laut.wav', `Abspielen: ${gespielt}`);
  gespielt.length = 0;
  await folgeAbspielen([{ url: 'audio/a-laut.wav', standard: true }]);
  pruefe(gespielt[0] === 'audio/a-laut.wav', '„▶ Standard“ spielt die eigene Aufnahme');

  // 5. Wörter und Lob; Fortschritt im Reiter
  [...$('#studio-reiter').children][1].click();
  pruefe(studio.bereich === 'woerter' && $('#studio-text').textContent === 'Apfel', 'Wörter-Bereich');
  await sprechen(0.5); await studioSpeichern();
  pruefe(eigeneDatei('audio/a-wort.wav') && hauptWahl(a).wortAllein()[0].url === 'audio/a-wort.wav', 'Wort nicht übernommen');
  [...$('#studio-reiter').children][2].click();
  await sprechen(0.6); await studioSpeichern();
  pruefe(medien['lob-1'] && medien['lob-1'].stimme && lobQuelle().eigen, 'Lob nicht übernommen');
  const anzahl = (b) => studioStuecke(b).length;
  pruefe([...$('#studio-reiter').children].map((b) => b.textContent).join('|')
    === `Laute 1/30|Wörter 1/${anzahl('woerter')}|Lob 1/5|Ansagen 0/${anzahl('ansagen')}|Kisten 0/${anzahl('kisten')}|Reime 0/${anzahl('reime')}|Silben 0/${anzahl('silben')}`, `Reiter: ${$('#studio-reiter').textContent}`);
  pruefe(anzahl('woerter') > 60 && anzahl('ansagen') === Object.keys(ANSAGEN).length && anzahl('kisten') === 36 && anzahl('silben') > 70, 'Bereichsgrößen');
  // Neue Bereiche ersetzen die passende Standard-Datei in den Spielen
  [...$('#studio-reiter').children][3].click();
  await sprechen(0.8); await studioSpeichern();
  pruefe(eigeneDatei(`audio/ansage-${Object.keys(ANSAGEN)[0]}.wav`), 'Ansage nicht übernommen');
  [...$('#studio-reiter').children][4].click();
  await sprechen(0.5); await studioSpeichern();
  pruefe(eigeneDatei('audio/kiste-nase.wav'), 'Kisten-Wort nicht übernommen');
  [...$('#studio-reiter').children][6].click();
  await sprechen(0.3); await studioSpeichern();
  pruefe(eigeneDatei(studioStuecke('silben')[0].standard), 'Silbe nicht übernommen');
  // Eigenes Foto für ein Kisten-Wort: ersetzt das Emoji in der Wörterkiste, im Studio sichtbar, wieder löschbar
  [...$('#studio-reiter').children][4].click();
  studioGehe(0);
  pruefe(!$('#studio-foto').hidden && $('#btn-studio-foto-weg').hidden, 'Foto-Knöpfe bei Kisten-Wort');
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const png = await new Promise((r) => c.toBlob(r, 'image/png'));
  await datenbank.medienSetzen(zustand.profil, 'datei:kiste-nase.wav', 'bild', png);
  await medienLaden();
  studioZeichnen();
  pruefe(kisteFoto('nase') && $('#studio-bild img') && !$('#btn-studio-foto-weg').hidden, 'Foto nicht im Studio');
  kiste.kiste = KISTEN[0];
  pruefe(kisteKarte('nase').querySelector('img.kiste-foto') && !kisteKarte('ohr').querySelector('img'), 'Foto nicht in der Wörterkiste');
  $('#btn-studio-foto-weg').click(); await warte(300);
  pruefe(!kisteFoto('nase') && eigeneDatei('audio/kiste-nase.wav'), 'Foto-Löschen nimmt die Aufnahme mit');
  studioGehe(studioStuecke('kisten').length - 1);
  pruefe($('#studio-foto').hidden, 'Foto-Knopf bei Tierlaut');

  // Weitere Wörter (mehr): Ansage aus eigenem Laut/Wort-Teil
  [...$('#studio-reiter').children][1].click();
  studioGehe(1);
  pruefe($('#studio-text').textContent === 'Affe', `Zweites Wort: ${$('#studio-text').textContent}`);
  await sprechen(0.5); await studioSpeichern();
  pruefe(woerterFuer(BUCHSTABEN[0])[1].ansage().map((q) => q.url).join() === 'audio/a-laut.wav,audio/a-2-wort.wav', 'Weiteres Wort nicht aus Teilen');
  [...$('#studio-reiter').children][2].click();

  // 6. Sicherung enthält die Studio-Aufnahmen; Einspielen nimmt nur bekannte Schlüssel und eingebettete Daten
  const sicherung = await sicherungErstellen();
  const meins = sicherung.profile.find((p) => p.id === zustand.profil);
  pruefe(meins.medien.some((m) => m.schluessel.endsWith('|datei:a-laut.wav|stimme')), 'Studio-Aufnahme fehlt in der Sicherung');
  pruefe(MEDIEN_SCHLUESSEL.test('p-x|datei:m-laut.wav|stimme') && MEDIEN_SCHLUESSEL.test('p-x|m|bild') && MEDIEN_SCHLUESSEL.test('p-x|lob-3|stimme')
    && !MEDIEN_SCHLUESSEL.test('p-x|datei:../x.wav|stimme') && !MEDIEN_SCHLUESSEL.test('p-x|irgendwas|stimme'), 'MEDIEN_SCHLUESSEL');
  pruefe(await textZuBlob('https://example.com/x.wav') === null, 'Fremde Adresse in der Sicherung nicht abgelehnt');
  for (const typ of ['audio/webm;codecs=opus', 'audio/ogg; codecs=opus', 'image/jpeg', 'application/octet-stream', '']) {
    const b = await textZuBlob(`data:${typ};base64,AAAA`);
    pruefe(b && b.size === 3, `Eingebettete Daten „${typ}“ abgelehnt`);
  }
  // Einspielen: kaputter Eintrag wird übersprungen, der Rest kommt an; nichts geht vorher verloren
  const kopie = JSON.parse(JSON.stringify(sicherung));
  const p = kopie.profile.find((x) => x.id === zustand.profil);
  p.medien.push({ schluessel: `${p.id}|datei:x-laut.wav|stimme`, daten: 'https://example.com/boese.wav' });
  kopie.profile.push({ id: 'fund-k-1', name: 'Böse', medien: [] });
  const ergebnis = await sicherungEinspielen(kopie);
  pruefe(ergebnis.uebersprungen === 2, `Übersprungen: ${ergebnis.uebersprungen}`);
  pruefe((await datenbank.medienVon(zustand.profil)).some((m) => m.schluessel.endsWith('|datei:a-laut.wav|stimme')), 'Gültige Aufnahme nach dem Einspielen weg');
  pruefe(!(await datenbank.profile()).some((x) => x.id === 'fund-k-1'), 'Fremde Profil-ID angenommen');

  // 7. Zurücksetzen: einzeln und ganzer Bereich
  [...$('#studio-reiter').children][0].click();
  studioGehe(0);
  pruefe(!$('#btn-studio-zuruecksetzen').hidden, 'Zurücksetzen-Knopf fehlt');
  await studioZuruecksetzen(false);
  pruefe(!eigeneDatei('audio/a-laut.wav') && hauptWahl(a).ansage().map((q) => q.url).join() === 'audio/a-laut.wav,audio/a-wort.wav', 'Laut nicht zurückgesetzt (Wort bleibt eigen)');
  [...$('#studio-reiter').children][1].click();
  await studioZuruecksetzen(true);
  pruefe(!eigeneDatei('audio/a-wort.wav') && hauptWahl(a).ansage()[0].url === 'audio/a.wav', 'Bereich nicht zurückgesetzt');

  // 8. Späte Aufnahme nach dem Weiterblättern landet nicht beim falschen Stück
  studioGehe(3);
  const altesStueck = studioStuecke(studio.bereich)[3];
  const lauf = studio.lauf;
  studioGehe(4);
  await studioVerarbeiten(studioWav(ton(0.2, false), ton(0.4, true), ton(0.2, false)), altesStueck, lauf);
  pruefe(!studio.aufnahme, 'Späte Aufnahme beim falschen Stück');

  // 9. Zurück verlässt das Studio
  $('#btn-studio-zurueck').click(); await warte(400);
  pruefe($('#eltern').classList.contains('active'), 'Zurück führt nicht in den Elternbereich');

  // Ansicht: Studio mit einem gespeicherten Laut
  await studioOeffnen(); studioGehe(0); await sprechen(0.4); await studioSpeichern(); studioGehe(0);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : 'STUDIO-TESTS OK';
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
