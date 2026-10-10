// Testet die Startseite (nur Spiel-Kacheln) und den Weg ✏️ → Buchstaben → Nachspuren → zurück. Frisches Browserprofil.
(async function () {
  const fehler = [];
  const pruefe = (b, t) => { if (!b) fehler.push(t); };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const aktiv = (id) => $(`#${id}`).classList.contains('active');
  await startFertig;
  folgeAbspielen = () => Promise.resolve();

  // 1. Startseite: nur Spiele, keine Buchstaben, nichts ragt über den Rand, kein Scrollen nötig
  // (volles Regal mit Trommel = meiste Kacheln)
  zustand.spiele = ALLE_SPIELE;
  silben.bereit = new Set(Object.keys(SILBEN));
  spieleZeigen();
  pruefe(aktiv('home'), 'Startseite nicht aktiv');
  pruefe(!$('#home .kachel'), 'Buchstaben auf der Startseite');
  const spiele = [...document.querySelectorAll('#home .spiel-btn')].filter((b) => !b.hidden);
  pruefe(spiele.length >= 6, `Zu wenige Spiele: ${spiele.length}`);
  spiele.forEach((b) => {
    const r = b.getBoundingClientRect();
    pruefe(r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, `${b.dataset.spiel} ragt heraus`);
    pruefe(r.width >= 100 || (innerWidth > innerHeight && r.width >= 90), `${b.dataset.spiel} zu klein: ${Math.round(r.width)}`);
  });

  // 2. ✏️ → Buchstaben (A–Z): 30 Kacheln, eine Farbe, keine Sterne
  pruefe(zustand.reihenfolge === 'montessori', `Neues Gerät beginnt nicht mit Montessori: ${zustand.reihenfolge}`);
  zustand.reihenfolge = 'alphabet';
  zustand.sterne = { a: 2 };
  document.querySelector('.spiel-btn[data-spiel="spuren"]').click();
  pruefe(aktiv('buchstaben'), 'Buchstaben nicht geöffnet');
  const kacheln = document.querySelectorAll('#grid .kachel');
  pruefe(kacheln.length === BUCHSTABEN.length, `Kacheln: ${kacheln.length}`);
  pruefe(!document.querySelector('#grid .punkte') && !$('#grid').textContent.includes('⭐'), 'Sterne auf den Kacheln');
  const farben = new Set([...document.querySelectorAll('#grid .zeichen')].map((z) => getComputedStyle(z).color));
  pruefe(farben.size === 1, `Mehrere Buchstabenfarben: ${[...farben]}`);

  // 3. Buchstabe → Nachspuren → 🏠 zurück zu den Buchstaben → 🏠 zur Startseite
  kacheln[0].click();
  pruefe(aktiv('trace'), 'Nachspuren nicht geöffnet');
  pruefe(zustand.wahl.art === 'haupt', `Von der Kachel kein Kachel-Wort: ${zustand.wahl.wort}`);
  pruefe(!document.body.classList.contains('laedt'), 'Startseite bleibt verborgen');
  $('#btn-home').click();
  await pause(300);
  pruefe(aktiv('buchstaben'), 'Vom Nachspuren nicht zurück zu den Buchstaben');
  $('#btn-buchstaben-home').click();
  await pause(300);
  pruefe(aktiv('home'), 'Nicht zurück zur Startseite');

  // Natürliches Ende beim Nachspuren nach SPUR_ENDE_NACH geschafften Buchstaben; keine leeren Sterne vor dem Kind
  document.querySelector('.spiel-btn[data-spiel="spuren"]').click();
  document.querySelectorAll('#grid .kachel')[0].click();
  pruefe($('#fortschritt').textContent === '', `Sterne auf der Spur-Seite: ${$('#fortschritt').textContent}`);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  spurBesuch.geschafft = SPUR_ENDE_NACH - 1;
  geschafft();
  await pause(3500);
  pruefe($('#trace .spiel-ende') && !$('#trace .spiel-ende').hidden, 'Nachspuren ohne Ende');
  $('#trace .ende-nochmal').click();
  pruefe(spurBesuch.geschafft === 0 && $('#trace .spiel-ende').hidden, 'Nochmal setzt nicht zurück');
  $('#btn-home').click(); await pause(300);
  $('#btn-buchstaben-home').click(); await pause(300);
  // Elternbereich: beschreiben statt Sterne zählen
  pruefe(uebtGerade({ reihenfolge: 'montessori', sterne: {} }) === 'übt gerade m a s l' && uebtGerade({ reihenfolge: 'alphabet' }).startsWith('alle'), 'uebtGerade');

  // Pause: eigener Test tests/pause.js (gemeinsam mit Zahlennest)

  // Ansicht: Buchstaben-Bildschirm
  document.querySelector('.spiel-btn[data-spiel="spuren"]').click();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;color:#fff;font:12px monospace;padding:6px;z-index:9;background:'
    + (fehler.length ? '#c62828' : '#1b7f3a');
  d.textContent = fehler.length ? 'FEHLER: ' + fehler.join(' | ') : `STARTSEITE OK (${spiele.length} Spiele)`;
  document.body.appendChild(d);
})().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;background:#c62828;color:#fff;padding:6px;z-index:9">ABSTURZ: ${e}</div>`);
});
