'use strict';

// Bei jeder Änderung zusammen mit CACHE in sw.js erhöhen (wird im Elternbereich angezeigt)
const APP_VERSION = 70;

// ---------- Speicher (lokal auf dem Gerät) ----------

const speicher = {
  lesen(key, standard) {
    try {
      const wert = localStorage.getItem(key);
      return wert === null ? standard : JSON.parse(wert);
    } catch { return standard; }
  },
  schreiben(key, wert) {
    try { localStorage.setItem(key, JSON.stringify(wert)); } catch { /* privat/voll: ignorieren */ }
  },
};

// Browser bitten, Fotos, Aufnahmen und Sterne nicht bei Speicherknappheit zu löschen. Erst wenn es etwas zu schützen gibt
// (erstes Kind, Profil, Fund, Erzählung): Chrome entscheidet ohne Rückfrage, Firefox fragt nach.
function speicherSchuetzen() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { /* egal */ }
}

const zustand = {
  schreibweise: speicher.lesen('schreibweise', 'klein'),
  sterne: speicher.lesen('sterne', {}),
  index: 0,
};

const MAX_STERNE = 3;

// ---------- Profile, Fotos & Aufnahmen (IndexedDB, nur auf diesem Gerät) ----------

// "Standard" ist kein Datenbank-Eintrag: Thorsten + mitgelieferte Bilder, immer vorhanden.
const STANDARD = { id: 'standard', name: 'Standard' };
zustand.profil = speicher.lesen('profil', STANDARD.id);

const datenbank = (() => {
  let dbPromise = null;
  function oeffnen() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('lernapp', 3);
        req.onupgradeneeded = (ev) => {
          const db = req.result;
          if (!db.objectStoreNames.contains('aufnahmen')) db.createObjectStore('aufnahmen');
          if (!db.objectStoreNames.contains('profile')) db.createObjectStore('profile', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('medien')) db.createObjectStore('medien');
          if (!db.objectStoreNames.contains('kinder')) db.createObjectStore('kinder', { keyPath: 'id' });
          if (ev.oldVersion === 1) aufnahmenUebernehmen(req.transaction);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  // Version 1 kannte nur Aufnahmen ohne Profil: in ein Profil "Eigene Aufnahmen" übernehmen
  function aufnahmenUebernehmen(tx) {
    const alt = tx.objectStore('aufnahmen');
    const schluessel = alt.getAllKeys();
    const werte = alt.getAll();
    werte.onsuccess = () => {
      if (!schluessel.result.length) return;
      const id = 'p-uebernommen';
      tx.objectStore('profile').put({ id, name: 'Eigene Aufnahmen', erstellt: Date.now() });
      schluessel.result.forEach((b, i) => tx.objectStore('medien').put(werte.result[i], `${id}|${b}|stimme`));
      alt.clear();
      zustand.profil = id;
      speicher.schreiben('profil', id);
    };
  }
  async function aktion(store, modus, fn) {
    try {
      const db = await oeffnen();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, modus);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);   // z. B. Speicher voll: kommt oft nur als abort
      });
    } catch { return undefined; }
  }
  const bereich = (id) => IDBKeyRange.bound(`${id}|`, `${id}|￿`);
  return {
    profile: async () => ((await aktion('profile', 'readonly', (s) => s.getAll())) || [])
      .sort((a, b) => a.erstellt - b.erstellt),
    profilSpeichern: (p) => aktion('profile', 'readwrite', (s) => s.put(p)),
    async profilLoeschen(id) {
      await aktion('medien', 'readwrite', (s) => s.delete(bereich(id)));
      await aktion('profile', 'readwrite', (s) => s.delete(id));
    },
    kinder: async () => ((await aktion('kinder', 'readonly', (s) => s.getAll())) || [])
      .sort((a, b) => a.erstellt - b.erstellt),
    kindSpeichern: (k) => aktion('kinder', 'readwrite', (s) => s.put(k)),
    kindLoeschen: (id) => aktion('kinder', 'readwrite', (s) => s.delete(id)),
    alleMedien: async () => {
      const [schluessel, werte] = await Promise.all([
        aktion('medien', 'readonly', (s) => s.getAllKeys()),
        aktion('medien', 'readonly', (s) => s.getAll()),
      ]);
      return (schluessel || []).map((k, i) => ({ schluessel: k, blob: werte[i] }));
    },
    medienRoh: (schluessel, blob) => aktion('medien', 'readwrite', (s) => s.put(blob, schluessel)),
    medienSetzen: (id, b, art, blob) => aktion('medien', 'readwrite', (s) => s.put(blob, `${id}|${b}|${art}`)),
    medienEntfernen: (id, b, art) => aktion('medien', 'readwrite', (s) => s.delete(`${id}|${b}|${art}`)),
    async medienVon(id) {
      const [schluessel, werte] = await Promise.all([
        aktion('medien', 'readonly', (s) => s.getAllKeys(bereich(id))),
        aktion('medien', 'readonly', (s) => s.getAll(bereich(id))),
      ]);
      return (schluessel || []).map((k, i) => ({ schluessel: k, blob: werte[i] }));
    },
  };
})();

// Eigene Fotos/Aufnahmen des aktiven Profils, im Speicher für schnellen Zugriff: b -> { bildUrl, stimme }
let medien = {};

// Persönliche Wörter des aktiven Profils: [{ id, b, wort }]; Foto/Aufnahme unter medien['w-<id>']
let eigeneWoerter = [];
// Wörter der eigenen Kisten (Meine Leute, Meine Kita): [{ id, kiste, wort }]; Foto/Aufnahme ebenso unter medien['w-<id>']
let eigeneKistenWoerter = [];

// Gäste beim Lob (k.lobGaeste): andere Menschen, die ab und zu loben – fest beim Anfangsbuchstaben ihres Namens
// („O“ wie Oma). [{ id, name, b, lob: [Blobs], fotoUrl }]
let gastLob = [];
const gastZaehler = {};
const anfangsBuchstabe = (name) => {
  const b = [...(name || '').normalize('NFC').trim().toLowerCase()][0];
  return BUCHSTABEN.some((e) => e.b === b) ? b : null;
};

let gastLadeNummer = 0;
async function gastLobLaden() {
  const nr = ++gastLadeNummer;
  const k = aktivesKind();
  // Die Hauptstimme des Kindes ist kein Gast (zustand.profil ist im Elternbereich das gerade bearbeitete Profil)
  const ids = ((k && k.lobGaeste) || []).filter((id) => id !== k.profil);
  const neu = [];
  const profile = ids.length ? await datenbank.profile() : [];
  for (const id of ids) {
    const p = profile.find((x) => x.id === id);
    if (!p || !anfangsBuchstabe(p.name)) continue;
    const g = { id, name: p.name, b: anfangsBuchstabe(p.name), lob: [], fotoUrl: null };
    for (const { schluessel, blob } of await datenbank.medienVon(id)) {
      const [, platz, art] = schluessel.split('|');
      if (LOB_PLAETZE.includes(platz) && art === 'stimme') g.lob.push(blob);
      if (platz === 'ich' && art === 'bild') g.fotoUrl = URL.createObjectURL(blob);
    }
    if (g.lob.length) neu.push(g); else if (g.fotoUrl) URL.revokeObjectURL(g.fotoUrl);
  }
  // Überholt (z. B. zwei Häkchen schnell nacheinander): nur der letzte Lauf zählt, sonst stünden Gäste doppelt drin
  if (nr !== gastLadeNummer) { neu.forEach((g) => g.fotoUrl && URL.revokeObjectURL(g.fotoUrl)); return; }
  gastLob.forEach((g) => g.fotoUrl && URL.revokeObjectURL(g.fotoUrl));
  gastLob = neu;
}

async function medienLaden() {
  Object.values(medien).forEach((m) => m.bildUrl && URL.revokeObjectURL(m.bildUrl));
  medien = {};
  eigeneWoerter = [];
  eigeneKistenWoerter = [];
  await gastLobLaden();
  if (zustand.profil === STANDARD.id) return;
  const profil = (await datenbank.profile()).find((p) => p.id === zustand.profil);
  eigeneWoerter = (profil && profil.woerter) || [];
  eigeneKistenWoerter = (profil && profil.kistenWoerter) || [];
  for (const { schluessel, blob } of await datenbank.medienVon(zustand.profil)) {
    const [, b, art] = schluessel.split('|');
    const m = medien[b] || (medien[b] = {});
    if (art === 'bild') m.bildUrl = URL.createObjectURL(blob);
    else if (art === 'stimme') m.stimme = blob;
  }
}

async function profilAktivieren(id) {
  zustand.profil = id;
  // Mit Kindern gehört das Profil zum Kind (wird dort eingestellt), sonst gilt es für die ganze App
  if (!kinder.length) speicher.schreiben('profil', id);
  await medienLaden();
}

// ---------- Kinder: jedes Kind hat eigene Sterne, Schrift und eigenes Profil ----------

const TIERE = ['🦊', '🐻', '🐰', '🐼', '🦁', '🐸', '🐯', '🐨', '🦄', '🐶', '🐱', '🐵', '🐧', '🐢', '🦋', '🐞'];
let kinder = [];
let kindFotos = {};   // Kind-ID -> Objekt-URL des Fotos
zustand.kind = speicher.lesen('kind', null);

function aktivesKind() {
  return kinder.find((k) => k.id === zustand.kind) || null;
}

async function kinderLaden() {
  Object.values(kindFotos).forEach((url) => URL.revokeObjectURL(url));
  kindFotos = {};
  kinder = await datenbank.kinder();
  kinder.forEach((k) => { if (k.foto) kindFotos[k.id] = URL.createObjectURL(k.foto); });
}

function kindBildHtml(k) {
  return kindFotos[k.id]
    ? `<img class="bild-datei foto" src="${kindFotos[k.id]}" alt="${htmlText(k.name)}">`
    : htmlText(k.tier || '');   // nie roh: k.tier kann aus einer eingespielten Datei stammen
}

// Neue Geräte und neue Kinder beginnen in Montessori-Reihenfolge; wer die App schon nutzt, behält A–Z
const neuesGeraet = () => speicher.lesen('sterne', null) === null;
const reihenfolgeStandard = () => (neuesGeraet() ? 'montessori' : 'alphabet');

// Spiele-Regal: welche Spiele ein Kind auf der Startseite sieht (Montessori: ein Material kommt erst ins Regal,
// wenn es gezeigt wurde). Neue Kinder/Geräte beginnen mit wenigen Spielen, wer die App schon nutzt, behält alle.
// Gespeichert wird, was AUSGEBLENDET ist – so erscheinen neue Spiele nach einem Update von selbst.
const ALLE_SPIELE = ['spuren', 'zeigen', 'kiste', 'hoeren', 'reime', 'silben', 'name', 'memory', 'jagd', 'legen', 'album'];
const START_REGAL = ['spuren', 'zeigen', 'kiste', 'hoeren', 'silben', 'name', 'album'];
const ausVon = (sichtbar) => ALLE_SPIELE.filter((id) => !sichtbar.includes(id));
const START_AUS = ausVon(START_REGAL);
// Version 37 speicherte die sichtbaren Spiele ("spiele"); damals gab es diese acht
const REGAL_V37 = ['spuren', 'hoeren', 'silben', 'name', 'memory', 'jagd', 'legen', 'album'];

function regalAus(quelle) {
  if (Array.isArray(quelle.spieleAus)) return quelle.spieleAus;
  if (Array.isArray(quelle.spiele)) return REGAL_V37.filter((id) => !quelle.spiele.includes(id));
  return null;
}

function regalVon(aus) {
  const sichtbar = ALLE_SPIELE.filter((id) => !aus.includes(id));
  return sichtbar.length ? sichtbar : ALLE_SPIELE;
}

// Regal ohne Kinder: gespeichert, sonst neues Gerät = kleines Regal, bisheriges Gerät = alle
const appWeitAus = () => regalAus({ spieleAus: speicher.lesen('spieleAus', null), spiele: speicher.lesen('spiele', null) })
  || (neuesGeraet() ? START_AUS : []);

// Sterne, Schrift und Profil kommen vom aktiven Kind – ohne Kinder aus den App-weiten Einstellungen
function einstellungenLaden() {
  const k = aktivesKind();
  zustand.schreibweise = k ? k.schreibweise : speicher.lesen('schreibweise', 'klein');
  zustand.sterne = k ? k.sterne : speicher.lesen('sterne', {});
  zustand.profil = k ? k.profil : speicher.lesen('profil', STANDARD.id);
  zustand.album = k ? (k.album || []) : speicher.lesen('album', []);
  zustand.reihenfolge = k ? (k.reihenfolge || 'alphabet') : speicher.lesen('reihenfolge', reihenfolgeStandard());
  zustand.farbe = k ? (k.farbe || 'bunt') : speicher.lesen('farbe', 'bunt');
  zustand.reimHoeren = k ? !!k.reimHoeren : speicher.lesen('reimHoeren', false);
  zustand.spiele = regalVon(k ? (regalAus(k) || []) : appWeitAus());
  zustand.funde = k ? (k.funde || []) : speicher.lesen('funde', []);
}

function einstellungenSpeichern() {
  const k = aktivesKind();
  if (k) {
    k.schreibweise = zustand.schreibweise;
    k.sterne = zustand.sterne;
    k.album = zustand.album;
    k.reihenfolge = zustand.reihenfolge;
    k.farbe = zustand.farbe;
    k.reimHoeren = zustand.reimHoeren;
    k.spieleAus = ausVon(zustand.spiele);
    delete k.spiele;
    k.funde = zustand.funde;
    return datenbank.kindSpeichern(k);
  }
  speicher.schreiben('funde', zustand.funde);
  speicher.schreiben('reihenfolge', zustand.reihenfolge);
  speicher.schreiben('farbe', zustand.farbe);
  speicher.schreiben('reimHoeren', zustand.reimHoeren);
  speicher.schreiben('spieleAus', ausVon(zustand.spiele));
  try { localStorage.removeItem('spiele'); } catch { /* egal */ }
  speicher.schreiben('schreibweise', zustand.schreibweise);
  speicher.schreiben('sterne', zustand.sterne);
  speicher.schreiben('album', zustand.album);
  return Promise.resolve();
}

async function kindWaehlen(id) {
  zustand.kind = id;
  speicher.schreiben('kind', id);
  einstellungenLaden();
  await medienLaden();
}

// Bild: eigenes Foto > Bilddatei (für Wörter ohne passendes Emoji) > Emoji
function bildHtml(eintrag) {
  const eigenes = medien[eintrag.b] && medien[eintrag.b].bildUrl;
  if (eigenes) return `<img class="bild-datei foto" src="${eigenes}" alt="${eintrag.wort}">`;
  return eintrag.bild.startsWith('bilder/')
    ? `<img class="bild-datei" src="${eintrag.bild}" alt="${eintrag.wort}">`
    : eintrag.bild;
}

// Buchstabe als kleine Grafik aus der Strichfolge (gleiche Schul-Form wie beim Nachspuren), sonst als Text.
// Fester Höhenbereich je Schreibweise, damit Ober- und Unterlängen im Verhältnis bleiben.
function zeichenHtml(eintrag) {
  return strichSvg(zeichen(eintrag), zustand.schreibweise === 'gross' ? [-26, 110] : [-10, 148]);
}

function strichSvg(z, [oben, unten], mindestBreite = 60) {
  const daten = STRICHE[z];
  if (!daten) return z;
  const xs = daten.flat().map((p) => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const breite = Math.max(maxX - minX + 20, mindestBreite);
  const links = (minX + maxX) / 2 - breite / 2;
  const pfade = daten.map((st) => st.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')).join('');
  return `<svg class="zeichen-svg" viewBox="${links.toFixed(1)} ${oben} ${breite.toFixed(1)} ${unten - oben}" aria-label="${z}">`
    + `<path d="${pfade}" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function zeichen(eintrag) {
  if (zustand.schreibweise !== 'gross') return eintrag.b;
  // 'ß'.toUpperCase() ergäbe "SS" – das große Eszett ist ein eigenes Zeichen
  return eintrag.b === 'ß' ? 'ẞ' : eintrag.b.toUpperCase();
}

// ---------- Ton & Sprache ----------

let audioCtx = null;
// Ton-Baustein starten; darf nie werfen – sonst bräche jeder Tipp ab (z. B. ohne Soundgerät oder wenn der Browser ablehnt)
function audio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch { return null; }
  return audioCtx;
}

function glockenspiel() {
  const ctx = audio();
  if (!ctx) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.12;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}

let deutscheStimme = null;
function stimmeWaehlen() {
  if (!('speechSynthesis' in window)) return;
  const stimmen = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('de'));
  // Nur Stimmen, die auf dem Gerät laufen: Online-Stimmen schicken den Text (z. B. Namen aus „Meine Leute“) an einen Dienst
  deutscheStimme = stimmen.find((v) => v.localService) || null;
}
if ('speechSynthesis' in window) {
  stimmeWaehlen();
  speechSynthesis.onvoiceschanged = stimmeWaehlen;
}

function sprechen(text) {
  if (!('speechSynthesis' in window) || !deutscheStimme) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  if (deutscheStimme) u.voice = deutscheStimme;
  u.rate = 0.8;
  u.pitch = 1.1;
  speechSynthesis.speak(u);
}

// Abspielen von Audiodateien nacheinander; ein neuer Aufruf bricht den laufenden ab
const wiedergabe = { audio: null, nummer: 0 };

// Lob: 5 Plätze. Sobald Eltern einen eigenen Lob-Satz aufgenommen haben, kommen nur noch ihre Sätze.
const LOB_SAETZE = ['Super!', 'Toll gemacht!', 'Prima!', 'Klasse!', 'Wunderbar!'];
const LOB_PLAETZE = LOB_SAETZE.map((_, i) => `lob-${i + 1}`);
const zufall = (liste) => liste[Math.floor(Math.random() * liste.length)];

// Nie zweimal hintereinander derselbe Lob-Satz
let letztesLob = null;
function lobWaehlen(plaetze) {
  const auswahl = plaetze.length > 1 ? plaetze.filter((k) => k !== letztesLob) : plaetze;
  letztesLob = zufall(auswahl);
  return letztesLob;
}

// Lobt ein Gast bei diesem Buchstaben? Mehrere Gäste mit demselben Anfangsbuchstaben wechseln sich ab
function gastFuer(b) {
  const passende = b ? gastLob.filter((g) => g.b === b) : [];
  if (!passende.length) return null;
  gastZaehler[b] = (gastZaehler[b] || 0) + 1;
  return passende[gastZaehler[b] % passende.length];
}

// Kleines Foto der Person, die gerade lobt (nur bei Gästen – die Hauptstimme spricht ohnehin immer)
function sprecherZeigen(gast) {
  const el = $('#sprecher');
  if (!el || !gast.fotoUrl) return;
  el.innerHTML = `<img src="${gast.fotoUrl}" alt="">`;
  el.classList.remove('zeigen');
  void el.offsetWidth;
  el.classList.add('zeigen');
}

function lobQuelle(b = null) {
  const gast = gastFuer(b);
  if (gast) {
    // Nie zweimal hintereinander derselbe Satz; das Foto erscheint erst, wenn die Aufnahme wirklich startet (folgeAbspielen)
    const i = gast.lob.length > 1 ? zufall(gast.lob.map((_, n) => n).filter((n) => n !== gast.letzter)) : 0;
    gast.letzter = i;
    return { url: URL.createObjectURL(gast.lob[i]), eigen: true, gast: gast.id, sprecher: gast };
  }
  const eigene = LOB_PLAETZE.filter((k) => medien[k] && medien[k].stimme);
  if (eigene.length) return { url: URL.createObjectURL(medien[lobWaehlen(eigene)].stimme), eigen: true };
  return { url: `audio/${lobWaehlen(LOB_PLAETZE)}.wav`, eigen: false };
}

// Lob wie beim Nachspuren: ab und zu mit dem aufgenommenen Namen des Kindes (nie zweimal hintereinander)
function lobMitName(b = null) {
  const k = aktivesKind();
  const folge = [lobQuelle(b)];
  // Nach Omas Lob nicht Mamas Aufnahme des Namens (zwei Stimmen in einem Satz)
  if (k && k.nameStimme && !folge[0].gast && nameImLob()) folge.push({ url: URL.createObjectURL(k.nameStimme), eigen: true, name: true });
  return folge;
}

function wiedergabeStoppen() {
  wiedergabe.nummer++;
  if (wiedergabe.audio) { wiedergabe.audio.pause(); wiedergabe.audio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function abspielen(quelle) {
  return new Promise((resolve, reject) => {
    const a = new Audio(quelle);
    wiedergabe.audio = a;
    a.onended = resolve;
    a.onerror = reject;
    a.play().catch(reject);
  });
}

// ---------- Wörter je Buchstabe ----------
// Vorrat: Hauptwort (mit eigenem Foto/eigener Aufnahme des Profils), weitere Standard-Wörter ("mehr"),
// persönliche Wörter des Profils. Jede Wahl liefert Bild, Ansage ("mmm … mmm … Maus") und das Wort allein.
const blobQuelle = (blob) => ({ url: URL.createObjectURL(blob), eigen: true });

// "Laut … Laut … Wort": hat das Profil Laut oder Wort selbst eingesprochen, wird aus den Einzelteilen gespielt
const teilEigen = (datei) => !!eigeneDatei(`audio/${datei}`);
const lautUndWort = (d, wortDatei, ganzDatei) => (teilEigen(`${d}-laut.wav`) || teilEigen(wortDatei)
  ? [{ url: `audio/${d}-laut.wav` }, { url: `audio/${wortDatei}` }] : [{ url: `audio/${ganzDatei}` }]);

function hauptWahl(e) {
  const d = dateiName(e.b);
  // Älteste Form: eine Aufnahme für den ganzen Clip "mmm … mmm … Maus" (Profil-Liste "Bilder & Stimme")
  const eigene = () => medien[e.b] && medien[e.b].stimme;
  return {
    art: 'haupt', b: e.b, wort: e.wort, gewicht: 1,
    bild: () => bildHtml(e),
    // Im Studio eingesprochene Teile gehen vor der alten Ganz-Aufnahme
    ansage: () => (eigene() && !teilEigen(`${d}-laut.wav`) && !teilEigen(`${d}-wort.wav`)
      ? [blobQuelle(eigene())] : lautUndWort(d, `${d}-wort.wav`, `${d}.wav`)),
    wortAllein: () => [eigene() && !teilEigen(`${d}-wort.wav`) ? blobQuelle(eigene()) : { url: `audio/${d}-wort.wav` }],
  };
}

function woerterFuer(e) {
  const d = dateiName(e.b);
  const vorrat = [hauptWahl(e)];
  (e.mehr || []).forEach(([wort, bild], i) => vorrat.push({
    art: 'mehr', b: e.b, wort, gewicht: 1,
    bild: () => bild,
    ansage: () => lautUndWort(d, `${d}-${i + 2}-wort.wav`, `${d}-${i + 2}.wav`),
    wortAllein: () => [{ url: `audio/${d}-${i + 2}-wort.wav` }],
  }));
  eigeneWoerter.filter((w) => w.b === e.b).forEach((w) => {
    const m = () => medien[`w-${w.id}`] || {};
    vorrat.push({
      art: 'eigen', b: e.b, wort: w.wort, id: w.id, gewicht: 3,   // persönliche Wörter kommen öfter dran
      bild: () => (m().bildUrl ? `<img class="bild-datei foto" src="${m().bildUrl}" alt="${htmlText(w.wort)}">` : '💛'),
      // Thorstens Laut + Ihre Aufnahme des Wortes ("mmm … mmm … Mama")
      ansage: () => [{ url: `audio/${d}-laut.wav` }, ...(m().stimme ? [blobQuelle(m().stimme)] : [])],
      wortAllein: () => (m().stimme ? [blobQuelle(m().stimme)] : []),
    });
  });
  return vorrat;
}

// Zufälliges Wort nach Gewicht; möglichst nicht dasselbe wie beim letzten Mal
function wortWaehlen(e, vorher = null) {
  let vorrat = woerterFuer(e);
  if (vorher && vorrat.length > 1) vorrat = vorrat.filter((w) => w.wort !== vorher.wort);
  let r = Math.random() * vorrat.reduce((s, w) => s + w.gewicht, 0);
  for (const w of vorrat) { r -= w.gewicht; if (r <= 0) return w; }
  return vorrat[vorrat.length - 1];
}

// Was nacheinander gespielt wird. Ohne Lob: Ansage des gewählten Wortes ("mmm … mmm … Maus").
// Lob: Lob-Satz, dann ab und zu der Name des Kindes (nur wenn aufgenommen), dann das Wort.
// "eigen" = Objekt-URL, die nach dem Abspielen freigegeben wird.
function wiedergabeFolge(eintrag, lob, kind, nameSagen = true, wahl = null) {
  const w = wahl || hauptWahl(eintrag);
  const folge = [];
  if (lob) {
    // Gäste nur beim spielenden Kind (nicht beim Probehören eines anderen Kindes im Elternbereich)
    folge.push(lobQuelle(kind === aktivesKind() ? eintrag.b : null));
    if (nameSagen && kind && kind.nameStimme && !folge[0].gast) folge.push({ url: URL.createObjectURL(kind.nameStimme), eigen: true, name: true });
    folge.push(...w.wortAllein());
  } else {
    folge.push(...w.ansage());
  }
  return folge;
}

// Eltern-Stimme vor Standard: hat das Profil eine Datei selbst eingesprochen (Studio im Elternbereich),
// wird statt audio/<name>.wav die eigene Aufnahme gespielt – in allen Spielen
const eigeneDatei = (url) => {
  const m = typeof url === 'string' && url.startsWith('audio/') && medien[`datei:${url.slice(6)}`];
  return m && m.stimme ? m.stimme : null;
};

async function folgeAbspielen(folge, ersatzText) {
  wiedergabeStoppen();
  const nummer = wiedergabe.nummer;
  try {
    for (const q of folge) {
      if (nummer !== wiedergabe.nummer) return;
      if (q.sprecher) sprecherZeigen(q.sprecher);
      const eigen = !q.eigen && !q.standard && eigeneDatei(q.url);   // standard: zum Vergleichen im Studio
      if (!eigen) { await abspielen(q.url); continue; }
      const url = URL.createObjectURL(eigen);
      try { await abspielen(url); } finally { URL.revokeObjectURL(url); }
    }
  } catch {
    // Datei fehlt (z. B. offline ohne Cache): Notlösung Sprachausgabe des Geräts
    if (nummer === wiedergabe.nummer && ersatzText) sprechen(ersatzText);
  } finally {
    folge.filter((q) => q.eigen).forEach((q) => URL.revokeObjectURL(q.url));
  }
}

// Name im Lob nur ab und zu (etwa jedes dritte Mal), nie zweimal hintereinander – sonst klingt es künstlich
const NAME_ANTEIL = 0.35;
let letztesLobMitName = false;
function nameImLob() {
  const ja = !letztesLobMitName && Math.random() < NAME_ANTEIL / (1 - NAME_ANTEIL);
  letztesLobMitName = ja;
  return ja;
}

function lautAbspielen(eintrag, lob = false, danach = []) {
  // Beim gerade geöffneten Buchstaben das dort gewählte Wort verwenden
  const wahl = BUCHSTABEN[zustand.index] === eintrag && zustand.wahl && zustand.wahl.b === eintrag.b ? zustand.wahl : null;
  const wort = wahl ? wahl.wort : eintrag.wort;
  const ersatz = lob ? `Super! ${wort}` : `${eintrag.laut} … ${eintrag.laut} wie ${wort}`;
  return folgeAbspielen([...wiedergabeFolge(eintrag, lob, aktivesKind(), lob && nameImLob(), wahl), ...danach], ersatz);
}

// Einzelnen Lob-Platz anhören: eigene Aufnahme, sonst Thorstens Satz für diesen Platz
async function lobAnhoeren(platz) {
  wiedergabeStoppen();
  const eigene = medien[platz] && medien[platz].stimme;
  const url = eigene ? URL.createObjectURL(eigene) : `audio/${platz}.wav`;
  try { await abspielen(url); } catch { /* abgebrochen */ }
  if (eigene) URL.revokeObjectURL(url);
}

// ---------- Bildschirme & Navigation ----------

const $ = (sel) => document.querySelector(sel);

function zeigen(id, verlauf = true) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  // Android-Zurück-Taste soll zur Startseite führen, nicht die App schließen
  if (verlauf && id !== 'home') history.pushState({ screen: id }, '');
}

// Zurück-Taste: zum Bildschirm aus dem Verlauf (z. B. vom Kind zurück in den Elternbereich), sonst Startseite
window.addEventListener('popstate', async () => {
  wiedergabeStoppen();
  $('#farbwahl').hidden = true;
  clearTimeout(hoerSpiel.timer);
  clearTimeout(memory.timer);
  clearTimeout(memory.timerNeu);
  clearTimeout(jagd.timer);
  clearTimeout(legen.timer);
  silbenTimerStoppen();
  zeigenStoppen();
  zustand.lektionSpur = null;
  kisteStoppen();
  reimStoppen();
  studioAbbrechen();
  studioMikrofonZu();
  stopAufnahme();
  const ziel = (history.state && history.state.screen) || 'home';
  // Infoseite von der Begrüßung aus geöffnet: dorthin zurück
  if (ziel === 'home' && $('#info').classList.contains('active') && infoVonBegruessung) {
    infoVonBegruessung = false;
    zeigen('willkommen', false);
    return;
  }
  if (ziel === 'eltern') {
    await elternZeichnen();
    zeigen('eltern', false);
    return;
  }
  if ($('#eltern').classList.contains('active') || $('#kind').classList.contains('active')) await elternVerlassen();
  clearTimeout(tafelZustand.jubelTimer);
  nameModusBeenden();
  rasterZeichnen();
  // Vom Nachspuren zurück zur Buchstabenwahl, sonst zur Startseite
  zeigen(ziel === 'buchstaben' ? 'buchstaben' : 'home', false);
});

// Spiel-Ende: Pokal bleibt stehen, dann großes Haus und kleineres Nochmal.
// Kein automatisches Weiterspielen – Kinder sollen ein natürliches Ende erleben.
// Sanfte Pause (Elternbereich, pro Gerät, Standard aus): nach X Minuten Spielzeit kommt am nächsten Spielende statt
// 🏠/🔁 ein ruhiges Pausen-Bild – nie mitten im Spiel, kein Countdown, keine Sperre. Gezählt wird nur sichtbare Spielzeit;
// nach 30 Minuten ohne Benutzung beginnt die Zählung neu.
const PAUSE_NEUSTART = 30 * 60000;
const spielzeit = { ms: 0, letzte: 0 };
(() => {
  const gespeichert = speicher.lesen('spielzeit', null);
  if (gespeichert && Date.now() - gespeichert.letzte < PAUSE_NEUSTART) Object.assign(spielzeit, gespeichert);
})();
setInterval(() => {
  const jetzt = Date.now();
  const elternSicht = document.querySelector('.screen.eltern.active');
  if (document.hidden || elternSicht) return;   // nur sichtbare Spielzeit zählt
  if (spielzeit.letzte && jetzt - spielzeit.letzte > PAUSE_NEUSTART) spielzeit.ms = 0;
  spielzeit.ms += Math.min(10000, spielzeit.letzte ? jetzt - spielzeit.letzte : 10000);
  spielzeit.letzte = jetzt;
  speicher.schreiben('spielzeit', spielzeit);
}, 10000);

const pauseFaellig = () => {
  const minuten = speicher.lesen('pauseNach', 0);
  return minuten > 0 && spielzeit.ms >= minuten * 60000;
};

function pauseZeigen(screen) {
  let pause = screen.querySelector('.spiel-pause');
  if (!pause) {
    pause = document.createElement('div');
    pause.className = 'spiel-pause';
    pause.innerHTML = '<div class="pause-bild" aria-hidden="true">😴</div><button class="ende-home" aria-label="Fertig">🏠</button>';
    pause.querySelector('.ende-home').addEventListener('click', () => { pause.hidden = true; screen.querySelector('.topbar .icon-btn').click(); });
    screen.appendChild(pause);
  }
  pause.hidden = false;
  screen.querySelector('.jubel').classList.remove('zeigen');
  folgeAbspielen([{ url: 'audio/ansage-pause.wav' }], 'Jetzt machen wir eine Pause.');
  spielzeit.ms = 0;   // nach der Pause darf wieder gespielt werden – die Eltern entscheiden
  speicher.schreiben('spielzeit', spielzeit);
}

function spielEnde(id, nochmal) {
  const screen = $(`#${id}`);
  if (pauseFaellig()) { pauseZeigen(screen); return; }
  let ende = screen.querySelector('.spiel-ende');
  if (!ende) {
    ende = document.createElement('div');
    ende.className = 'spiel-ende';
    ende.innerHTML = '<button class="ende-home" aria-label="Fertig">🏠</button><button class="ende-nochmal" aria-label="Nochmal">🔁</button>';
    ende.querySelector('.ende-home').addEventListener('click', () => screen.querySelector('.topbar .icon-btn').click());
    ende.querySelector('.ende-nochmal').addEventListener('click', () => { audio(); spielEndeWeg(id); ende.nochmal(); });
    screen.appendChild(ende);
  }
  ende.nochmal = nochmal;
  ende.hidden = false;
}

function spielEndeWeg(id) {
  const screen = $(`#${id}`);
  const ende = screen.querySelector('.spiel-ende');
  if (ende) ende.hidden = true;
  const pause = screen.querySelector('.spiel-pause');
  if (pause) pause.hidden = true;
  screen.querySelector('.jubel').classList.remove('zeigen');
}

function zurStartseite() {
  if (history.state && history.state.screen) history.back();
  else { rasterZeichnen(); zeigen('home', false); }
}

function sterneText(n) {
  return '⭐'.repeat(n) + '☆'.repeat(MAX_STERNE - n);
}

// ---------- Montessori-Reihenfolge: Buchstaben nach und nach freischalten ----------

// Gruppen gut hörbarer Laute; die nächste Gruppe öffnet sich, wenn jeder Buchstabe der Gruppe genug Sterne hat
const MONTESSORI_GRUPPEN = [
  ['m', 'a', 's', 'l'], ['o', 'i', 'e', 'n'], ['r', 't', 'u', 'f'], ['h', 'd', 'b', 'k'],
  ['p', 'g', 'w', 'z'], ['j', 'v', 'c', 'q', 'x', 'y'], ['ä', 'ö', 'ü', 'ß'],
];
const FREI_AB_STERNEN = 2;

const montessori = () => zustand.reihenfolge === 'montessori';

// Reihenfolge der Buchstaben auf der Startseite (Indizes in BUCHSTABEN)
function buchstabenReihenfolge() {
  if (!montessori()) return BUCHSTABEN.map((_, i) => i);
  return MONTESSORI_GRUPPEN.flat().map((b) => BUCHSTABEN.findIndex((e) => e.b === b));
}

// Freigeschaltete Buchstaben eines bestimmten Kindes (wie freigeschaltet(), aber nicht nur für das aktive)
function freiFuer(k) {
  if ((k.reihenfolge || 'alphabet') !== 'montessori') return new Set(BUCHSTABEN.map((e) => e.b));
  const frei = new Set();
  for (const gruppe of MONTESSORI_GRUPPEN) {
    gruppe.forEach((b) => frei.add(b));
    if (!gruppe.every((b) => ((k.sterne || {})[b] || 0) >= FREI_AB_STERNEN)) break;
  }
  return frei;
}

function freigeschaltet() {
  if (!montessori()) return new Set(BUCHSTABEN.map((e) => e.b));
  const frei = new Set();
  for (const gruppe of MONTESSORI_GRUPPEN) {
    gruppe.forEach((b) => frei.add(b));
    if (!gruppe.every((b) => (zustand.sterne[b] || 0) >= FREI_AB_STERNEN)) break;
  }
  return frei;
}

// Montessori: aktuelle Gruppe und schon gelernte Buchstaben; noch nicht eingeführte bleiben unsichtbar
function montessoriStand() {
  const frei = freigeschaltet();
  const offen = MONTESSORI_GRUPPEN.filter((g) => g.every((b) => frei.has(b)));
  const aktuell = offen.find((g) => !g.every((b) => (zustand.sterne[b] || 0) >= FREI_AB_STERNEN)) || [];
  return { aktuell, gelernt: offen.filter((g) => g !== aktuell).flat() };
}

// Startseite: nur Spiele aus dem Regal; Trommel nur mit Silben-Aufnahmen, "Mein Name" nur mit Kind
function spieleZeigen() {
  const k = aktivesKind();
  const regal = zustand.spiele && zustand.spiele.length ? zustand.spiele : ALLE_SPIELE;
  document.querySelectorAll('#home .spiel-btn').forEach((btn) => {
    const id = btn.dataset.spiel;
    btn.hidden = !regal.includes(id) || (id === 'name' && !(k && nameZeichen(k.name).length))
      || (id === 'silben' && !silbenGenug());
  });
  // Viele Spiele im Regal: kleinere Kacheln, damit alles ohne Scrollen passt
  $('#home .spiele-raster').classList.toggle('viele', document.querySelectorAll('#home .spiel-btn:not([hidden])').length > 8);
}

// Auswahl fürs Regal im Elternbereich (je Kind oder app-weit); das letzte Spiel lässt sich nicht abwählen
// Für Eltern: was jedes Spiel tut (die Kacheln zeigen den Kindern nur ein Bild); eltern = braucht einen Erwachsenen dabei
const SPIEL_INFO = {
  spuren: { text: 'Buchstaben in Schreibrichtung nachspuren' },
  zeigen: { text: 'Laut und Buchstabe verbinden (Drei-Stufen-Lektion)' },
  kiste: { text: 'Wortschatz nach Themen, danach zusammen erzählen', eltern: 'Erzählen am Ende' },
  hoeren: { text: 'Anlaut hören, passendes Bild antippen' },
  reime: { text: 'Was reimt sich? (eher ab 4)' },
  silben: { text: 'Pro Silbe einmal trommeln' },
  name: { text: 'Den eigenen Namen nachspuren – auch die der Geschwister und aus „Meine Leute“' },
  memory: { text: 'Groß- und Kleinbuchstaben finden' },
  jagd: { text: 'Etwas mit dem Laut zu Hause finden und fotografieren', eltern: 'Kamera' },
  legen: { text: 'Wörter aus Buchstaben legen (eher ab 4–5)' },
  album: { text: 'Gesammelte Sticker, Funde und Erzählungen' },
};

function regalWahlZeichnen(box, gewaehlt, aendern) {
  box.innerHTML = '';
  ALLE_SPIELE.forEach((id) => {
    const vorlage = document.querySelector(`#home .spiel-btn[data-spiel="${id}"]`);
    const btn = document.createElement('button');
    const an = gewaehlt.includes(id);
    const info = SPIEL_INFO[id] || {};
    btn.className = `regal-spiel${an ? ' gewaehlt' : ''}`;
    btn.innerHTML = `<span>${vorlage.textContent}</span><b>${vorlage.getAttribute('aria-label')}</b>`
      + `<small>${info.text || ''}${info.eltern ? ` · <em>mit Erwachsenem: ${info.eltern}</em>` : ''}</small>`;
    btn.setAttribute('aria-pressed', an);
    btn.addEventListener('click', () => {
      const neu = an ? gewaehlt.filter((x) => x !== id) : ALLE_SPIELE.filter((x) => x === id || gewaehlt.includes(x));
      if (neu.length) aendern(neu);
    });
    box.appendChild(btn);
  });
}

let gezeigteGruppe = null;   // damit eine neue Gruppe beim ersten Zeigen "dazukommt" (Animation)

function kachelBauen(i, extra = '') {
  const eintrag = BUCHSTABEN[i];
  const btn = document.createElement('button');
  btn.className = `kachel${extra}`;
  btn.setAttribute('aria-label', `${eintrag.b} wie ${eintrag.wort}`);
  // Sterne nur im Album/Elternbereich – auf jeder Kachel verleiten sie zum Sammeln statt zum Spuren
  btn.innerHTML = `<span class="zeichen">${zeichenHtml(eintrag)}</span><span class="mini">${bildHtml(eintrag)}</span>`;
  btn.addEventListener('click', () => buchstabeOeffnen(i, true, true));
  return btn;
}

const buchstabenIndex = (b) => BUCHSTABEN.findIndex((e) => e.b === b);

function rasterZeichnen() {
  // Oben links: wer gerade spielt (Tipp darauf -> "Wer spielt?")
  const k = aktivesKind();
  $('#btn-kind').hidden = !k;
  if (k) $('#btn-kind').innerHTML = kindBildHtml(k);
  spieleZeigen();
  const grid = $('#grid');
  grid.innerHTML = '';
  const { aktuell, gelernt } = montessori() ? montessoriStand() : { aktuell: [], gelernt: [] };
  // Alles gelernt (oder A–Z): normales Raster
  grid.classList.toggle('montessori', aktuell.length > 0);
  if (!montessori()) {
    BUCHSTABEN.forEach((_, i) => grid.appendChild(kachelBauen(i)));
    return;
  }
  const schluessel = aktuell.join('');
  const neu = gezeigteGruppe !== null && gezeigteGruppe !== schluessel;
  gezeigteGruppe = schluessel;
  aktuell.forEach((b) => grid.appendChild(kachelBauen(buchstabenIndex(b), ` jetzt${neu ? ' kommt-dazu' : ''}`)));
  if (gelernt.length) {
    if (aktuell.length) grid.insertAdjacentHTML('beforeend', '<div class="raster-trenner" aria-hidden="true"></div>');
    gelernt.forEach((b) => grid.appendChild(kachelBauen(buchstabenIndex(b), aktuell.length ? ' gelernt' : '')));
  }
}

// ---------- Nachspuren ----------

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');

// Prüf-Raster in niedriger Auflösung: Ziel (Buchstabe), erlaubt (Buchstabe + Toleranz), Spur des Kindes.
// Die Auflösung richtet sich nach der Buchstabengröße, damit Handy und Tablet gleich genau prüfen.
const PRUEF_BUCHSTABE = 150;
const pruef = {
  skala: 1,
  ziel: null,
  erlaubt: null,
  spur: document.createElement('canvas'),
};
const spurCtx = pruef.spur.getContext('2d', { willReadFrequently: true });

const tafelZustand = {
  breite: 0,
  hoehe: 0,
  schrift: null,       // { groesse, x, y }
  linienbreite: 20,
  pointerId: null,
  letzter: null,
  geschafft: false,
};

function schriftFuer(groesse) {
  return `700 ${groesse}px "Andika", "Nunito", system-ui, sans-serif`;
}

// Buchstabe so groß wie möglich und mittig in die Tafel einpassen
function buchstabenLayout(text, breite, hoehe) {
  const m = (() => { ctx.font = schriftFuer(100); return ctx.measureText(text); })();
  const bw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const bh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  // In ein Quadrat einpassen, damit Buchstaben auf hohen Handys nicht riesig werden
  const kante = Math.min(breite, hoehe) * 0.72;
  const faktor = Math.min(kante / bw, kante / bh);
  const groesse = 100 * faktor;
  const links = m.actualBoundingBoxLeft * faktor;
  const rechts = m.actualBoundingBoxRight * faktor;
  const oben = m.actualBoundingBoxAscent * faktor;
  const unten = m.actualBoundingBoxDescent * faktor;
  return {
    groesse,
    x: breite / 2 - (rechts - links) / 2,
    y: hoehe / 2 + (oben - unten) / 2,
  };
}

function buchstabeMalen(c, s, skala, art) {
  if (!s) return;   // Tafel noch nicht aufgebaut (z. B. sofort weitergetippt)
  c.save();
  c.scale(skala, skala);
  c.font = schriftFuer(s.groesse);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  if (art === 'vorlage') {
    c.fillStyle = '#f4eee5';
    c.fillText(text(), s.x, s.y);
    c.setLineDash([2, 10]);
    c.lineCap = 'round';
    c.lineWidth = 4;
    c.strokeStyle = '#b39a74';
    c.strokeText(text(), s.x, s.y);
  } else if (art === 'ziel') {
    c.fillStyle = '#000';
    c.fillText(text(), s.x, s.y);
  } else if (art === 'erlaubt') {
    c.fillStyle = '#000';
    c.strokeStyle = '#000';
    c.lineWidth = tafelZustand.linienbreite * 1.4;
    c.fillText(text(), s.x, s.y);
    c.strokeText(text(), s.x, s.y);
  }
  c.restore();
}

function text() {
  if (zustand.nameModus) return zustand.nameModus.zeichen[zustand.nameModus.pos];
  return zeichen(BUCHSTABEN[zustand.index]);
}

function maske(art) {
  const { breite, hoehe, schrift } = tafelZustand;
  const c = document.createElement('canvas');
  c.width = Math.round(breite * pruef.skala);
  c.height = Math.round(hoehe * pruef.skala);
  const cx = c.getContext('2d', { willReadFrequently: true });
  buchstabeMalen(cx, schrift, pruef.skala, art);
  const daten = cx.getImageData(0, 0, c.width, c.height).data;
  const bits = new Uint8Array(c.width * c.height);
  for (let i = 0; i < bits.length; i++) bits[i] = daten[i * 4 + 3] > 128 ? 1 : 0;
  return bits;
}

const vorlage = $('#vorlage');
const vorlageCtx = vorlage.getContext('2d');
const lichter = $('#lichter');
const lichterCtx = lichter.getContext('2d');

function tafelAufbauen() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  // Ein noch laufender Jubel vom vorigen Buchstaben darf die neue Tafel nicht leeren
  clearTimeout(tafelZustand.jubelTimer);
  tafelZustand.pointerId = null;
  tafelZustand.letzter = null;
  $('#jubel').classList.remove('zeigen');
  const dpr = window.devicePixelRatio || 1;
  tafelZustand.breite = rect.width;
  tafelZustand.hoehe = rect.height;
  canvas.width = vorlage.width = lichter.width = Math.round(rect.width * dpr);
  canvas.height = vorlage.height = lichter.height = Math.round(rect.height * dpr);

  // Buchstaben mit Strichdaten: geführtes Nachspuren Strich für Strich
  if (STRICHE[text()]) {
    strichLayout(STRICHE[text()], rect.width, rect.height);
    tafelLeeren();
    vormachenStarten();
    return;
  }
  gefuehrt.aktiv = false;
  lichterLeeren();

  tafelZustand.schrift = buchstabenLayout(text(), rect.width, rect.height);
  // Spurbreite etwas dicker als der Buchstabenstrich (wächst mit), mindestens fingerbreit
  tafelZustand.linienbreite = Math.max(22, tafelZustand.schrift.groesse * 0.14);

  pruef.skala = PRUEF_BUCHSTABE / (Math.min(rect.width, rect.height) * 0.72);
  pruef.spur.width = Math.round(rect.width * pruef.skala);
  pruef.spur.height = Math.round(rect.height * pruef.skala);
  pruef.ziel = maske('ziel');
  pruef.erlaubt = maske('erlaubt');
  buchstabenTeileAnalysieren();

  tafelLeeren();
}

function tafelLeeren() {
  funken = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  tafelZustand.geschafft = false;
  if (gefuehrt.aktiv) {
    gefuehrt.nr = 0;
    gefuehrt.fortschritt = 0;
    gefuehrt.spuren = [];
    gefuehrt.versuch = null;
    vorlageZeichnen();
    lauflicht.zyklusStart = lauflicht.letzteAktivitaet = performance.now();
    lauflicht.erinnert = false;
    lauflichtStarten();
    return;
  }
  startpunktZeigen(null);
  const dpr = canvas.width / (tafelZustand.breite || 1);
  vorlageCtx.setTransform(1, 0, 0, 1, 0, 0);
  vorlageCtx.clearRect(0, 0, vorlage.width, vorlage.height);
  buchstabeMalen(vorlageCtx, tafelZustand.schrift, dpr, 'vorlage');
  spurCtx.clearRect(0, 0, pruef.spur.width, pruef.spur.height);
}

const SPUR_FARBEN = ['#f28c38', '#3d8fd1', '#4caf50', '#9b59b6', '#e0567c', '#e6a700'];
// Fingerfarbe des Kindes: 'bunt' (je Buchstabe eine Farbe), feste Farbe, 'regenbogen' oder 'glitzer'
const FARB_AUSWAHL = ['bunt', '#f28c38', '#3d8fd1', '#4caf50', '#9b59b6', '#e0567c', '#e6a700', 'regenbogen', 'glitzer'];
const GLITZER_GOLD = '#e6a700';
let regenbogenWeg = 0;   // bisher gemalte Strecke: daraus der Farbton beim Regenbogen

function spurFarbe(strecke = 0) {
  const f = zustand.farbe || 'bunt';
  if (f === 'bunt') return SPUR_FARBEN[zustand.index % SPUR_FARBEN.length];
  if (f === 'glitzer') return GLITZER_GOLD;
  if (f === 'regenbogen') {
    regenbogenWeg += strecke;
    return `hsl(${Math.round(regenbogenWeg * 0.9) % 360}, 85%, 55%)`;
  }
  return f;
}

// Glitzer: ab und zu ein kleiner weißer Funken auf der Spur. Die Funken werden gemerkt und nach jedem
// Spurstück in der Nähe neu gesetzt – sonst würde die weitergemalte Spur sie gleich wieder übermalen.
let funken = [];

function funkeln(p) {
  if (zustand.farbe !== 'glitzer') return;
  if (Math.random() < 0.35) {
    funken.push({
      x: p.x + (Math.random() - 0.5) * tafelZustand.linienbreite * 0.7,
      y: p.y + (Math.random() - 0.5) * tafelZustand.linienbreite * 0.7,
      r: 2 + Math.random() * 3,
    });
    if (funken.length > 400) funken.shift();
  }
  const nah = tafelZustand.linienbreite * 2;
  funken.forEach((f) => { if (Math.abs(f.x - p.x) < nah && Math.abs(f.y - p.y) < nah) funkenMalen(f); });
}

function funkenMalen({ x, y, r }) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * 0.5, y - r * 0.5); ctx.lineTo(x + r * 2, y);
  ctx.lineTo(x + r * 0.5, y + r * 0.5); ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * 0.5, y + r * 0.5);
  ctx.lineTo(x - r * 2, y); ctx.lineTo(x - r * 0.5, y - r * 0.5); ctx.closePath(); ctx.fill();
}

// Ein Stück Fingerspur. Ein einzelner Punkt (Antippen) wird als gefüllter Kreis gemalt:
// Chrome zeichnet eine Linie der Länge 0 nicht, auch nicht mit runden Enden.
function spurStueck(c, von, bis, breite, farbe) {
  if (Math.hypot(bis.x - von.x, bis.y - von.y) < 0.5) {
    c.fillStyle = farbe;
    c.beginPath();
    c.arc(bis.x, bis.y, breite / 2, 0, Math.PI * 2);
    c.fill();
    return;
  }
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = breite;
  c.strokeStyle = farbe;
  c.beginPath();
  c.moveTo(von.x, von.y);
  c.lineTo(bis.x, bis.y);
  c.stroke();
}

function linie(von, bis) {
  const dpr = canvas.width / tafelZustand.breite;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  spurStueck(ctx, von, bis, tafelZustand.linienbreite, spurFarbe(Math.hypot(bis.x - von.x, bis.y - von.y)));
  funkeln(bis);
  if (gefuehrt.aktiv) return;

  const s = pruef.skala;
  spurCtx.setTransform(s, 0, 0, s, 0, 0);
  spurStueck(spurCtx, von, bis, tafelZustand.linienbreite, '#000');
  spurCtx.setTransform(1, 0, 0, 1, 0, 0);
}

function punkt(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('pointerdown', () => { $('#farbwahl').hidden = true; });
canvas.addEventListener('pointerdown', (e) => {
  // Ein neuer erster Finger heißt: der vorige Kontakt ist vorbei, auch wenn sein "pointerup" nie ankam
  // (z. B. am Rand abgehoben oder Handballen). Sonst würden alle weiteren Tipps ignoriert.
  if (tafelZustand.pointerId !== null && e.isPrimary && e.pointerId !== tafelZustand.pointerId) {
    strichEnde({ pointerId: tafelZustand.pointerId });
  }
  if (tafelZustand.pointerId !== null || tafelZustand.geschafft) return;
  e.preventDefault();
  audio();
  tafelZustand.pointerId = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ältere Browser */ }
  const p = punkt(e);
  tafelZustand.letzter = p;
  linie(p, p);
  if (gefuehrt.aktiv) gefuehrtStart(p);
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== tafelZustand.pointerId) return;
  // Zwischenpunkte nutzen, damit schnelle Striche nicht eckig werden
  const gesammelt = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of gesammelt.length ? gesammelt : [e]) {
    const p = punkt(ev);
    // Auf dem Weg zum nächsten Strich (Finger nicht abgesetzt) keine Spur malen
    const unterwegs = gefuehrt.aktiv && gefuehrt.versuch && gefuehrt.versuch.unterwegs;
    if (!unterwegs) linie(tafelZustand.letzter, p);
    tafelZustand.letzter = p;
    if (gefuehrt.aktiv) gefuehrtBewegung(p);
  }
});

function strichEnde(e) {
  if (e.pointerId !== tafelZustand.pointerId) return;
  tafelZustand.pointerId = null;
  tafelZustand.letzter = null;
  if (gefuehrt.aktiv) gefuehrtEnde();
  else pruefen();
}
canvas.addEventListener('pointerup', strichEnde);
canvas.addEventListener('pointercancel', strichEnde);
canvas.addEventListener('lostpointercapture', strichEnde);

// ---------- Geführtes Nachspuren: Strich für Strich in Schreibrichtung ----------

const STRICH_BREITE = 12;   // Strichbreite der Vorlage in Einheiten des Vierlinien-Systems

// Farben für das geführte Nachspuren: Blau + Orange bleiben auch bei Rot-Grün-Schwäche unterscheidbar,
// und alle wichtigen Unterschiede stecken zusätzlich in der Helligkeit (Kontraste siehe README).
const FARBE = {
  umriss: '#c7b08a',     // feiner Rand um den ganzen Buchstaben
  offen: '#f4eee5',      // Striche, die noch kommen
  aktuell: '#e0c79c',    // Strich, der gerade dran ist
  fertig: '#ffffff',     // geschaffte Striche (darüber liegt die Fingerspur)
  pfeil: '#b8470b',      // Lauflicht-Pfeile
  start: '#1d5fbf',      // Startpunkt und Geisterpunkt
};
const gefuehrt = {
  aktiv: false,
  pfade: [],        // pro Strich: { p: [{x,y}], l: [Bogenlänge bis Punkt i], L: Gesamtlänge } in Bildschirm-Pixeln
  linien: {},       // y-Position von Ober-, Mittel-, Grund- und Unterlinie
  breite: 0,        // Strichbreite der Vorlage in Pixeln
  nr: 0,            // aktueller Strich
  fortschritt: 0,   // wie weit der aktuelle Strich schon nachgefahren ist (Pixel entlang des Strichs)
  versuch: null,    // aktueller Fingerstrich: { punkte, folgt, startFortschritt }
  spuren: [],       // gültige Fingerstriche (bleiben sichtbar)
};

function strichLayout(daten, breite, hoehe) {
  const alle = daten.flat();
  const xs = alle.map((p) => p[0]), ys = alle.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const rand = STRICH_BREITE;
  const kante = Math.min(breite, hoehe) * 0.74;
  const f = Math.min(kante / (maxX - minX + 2 * rand), kante / (maxY - minY + 2 * rand));
  const ox = breite / 2 - ((minX + maxX) / 2) * f;
  const oy = hoehe / 2 - ((minY + maxY) / 2) * f;
  gefuehrt.aktiv = true;
  gefuehrt.breite = STRICH_BREITE * f;
  gefuehrt.linien = { oben: oy, mitte: oy + 50 * f, grund: oy + 100 * f, unten: oy + 140 * f, mitUnterlinie: maxY > 100 };
  gefuehrt.pfade = daten.map((punkte) => {
    const p = punkte.map(([x, y]) => ({ x: ox + x * f, y: oy + y * f }));
    const l = [0];
    for (let i = 1; i < p.length; i++) l.push(l[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
    return { p, l, L: l[l.length - 1] };
  });
  tafelZustand.linienbreite = Math.max(22, gefuehrt.breite * 1.15);
}

// Punkt auf dem Strich nach s Pixeln
function punktBei(pfad, s) {
  s = Math.max(0, Math.min(pfad.L, s));
  let i = 1;
  while (i < pfad.p.length - 1 && pfad.l[i] < s) i++;
  const a = pfad.p[i - 1], b = pfad.p[i];
  const t = (s - pfad.l[i - 1]) / ((pfad.l[i] - pfad.l[i - 1]) || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Nächster Punkt auf dem Strich, nur im Bereich [von, bis] (damit z. B. beim Kreis nicht zum Ende gesprungen wird)
function projizieren(pfad, q, von, bis) {
  let best = { s: von, d: Infinity };
  for (let i = 1; i < pfad.p.length; i++) {
    if (pfad.l[i] < von || pfad.l[i - 1] > bis) continue;
    const a = pfad.p[i - 1], b = pfad.p[i];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
    const d = Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y);
    const s = Math.max(von, Math.min(bis, pfad.l[i - 1] + t * (pfad.l[i] - pfad.l[i - 1])));
    if (d < best.d) best = { s, d };
  }
  return best;
}

// "Sandpapier-Gefühl": leichtes Vibrieren, solange der Finger richtig auf dem Strich vorankommt.
// Funktioniert auf Android; iPhones unterstützen Vibration im Browser nicht.
const vibration = {
  an: speicher.lesen('vibration', true),
  letzte: 0,
  moeglich: typeof navigator.vibrate === 'function',
};
function vibrieren(muster, nurAlleMs = 0) {
  if (!vibration.an || !vibration.moeglich) return;
  const jetzt = performance.now();
  if (nurAlleMs && jetzt - vibration.letzte < nurAlleMs) return;
  vibration.letzte = jetzt;
  try { navigator.vibrate(muster); } catch { /* manche Geräte erlauben es nicht */ }
}

// Toleranzen (in Pixeln), großzügig für Kinderfinger
const fangRadius = () => Math.max(34, gefuehrt.breite * 1.6);      // so nah muss der Finger am Startpunkt aufsetzen
const spurToleranz = () => Math.max(26, gefuehrt.breite * 1.3);    // so weit darf er neben dem Strich sein
const abrutschGrenze = () => Math.max(48, gefuehrt.breite * 2.4);  // ab hier gilt der Versuch als abgerutscht

const istPunktStrich = (pfad) => pfad.L <= gefuehrt.breite * 0.6;

// Mehrere Punkte hintereinander (ä, ö, ü): Reihenfolge egal – den Punkt nehmen, der dem Finger am nächsten ist.
// Dazu wird er an die aktuelle Stelle getauscht.
function naechstenPunktWaehlen(p) {
  let best = gefuehrt.nr;
  for (let k = gefuehrt.nr; k < gefuehrt.pfade.length && istPunktStrich(gefuehrt.pfade[k]); k++) {
    const a = gefuehrt.pfade[k].p[0], b = gefuehrt.pfade[best].p[0];
    if (Math.hypot(p.x - a.x, p.y - a.y) < Math.hypot(p.x - b.x, p.y - b.y)) best = k;
  }
  if (best !== gefuehrt.nr) {
    [gefuehrt.pfade[gefuehrt.nr], gefuehrt.pfade[best]] = [gefuehrt.pfade[best], gefuehrt.pfade[gefuehrt.nr]];
  }
}

// Liegt der Finger näher an einem schon erledigten Punkt als am Ziel? Dann gilt er nicht für das Ziel
// (sonst würde bei ä/ö/ü ein zweiter Tipp auf denselben Punkt den Nachbarpunkt abhaken).
function naeherAnErledigtemPunkt(p, ziel) {
  const d = Math.hypot(p.x - ziel.x, p.y - ziel.y);
  return gefuehrt.pfade.slice(0, gefuehrt.nr).some((pf) => istPunktStrich(pf)
    && Math.hypot(p.x - pf.p[0].x, p.y - pf.p[0].y) < d);
}

function gefuehrtStart(p) {
  lauflicht.vormachen = null;          // Kind legt los: Vormachen sofort beenden
  lauflicht.letzteAktivitaet = performance.now();
  lauflicht.erinnert = false;
  if (istPunktStrich(gefuehrt.pfade[gefuehrt.nr])) naechstenPunktWaehlen(p);
  startpunktZeigen(punktBei(gefuehrt.pfade[gefuehrt.nr], gefuehrt.fortschritt));
  const pfad = gefuehrt.pfade[gefuehrt.nr];
  const start = punktBei(pfad, gefuehrt.fortschritt);
  const istPunkt = istPunktStrich(pfad);
  const folgt = Math.hypot(p.x - start.x, p.y - start.y) <= fangRadius() * (istPunkt ? 1.4 : 1)
    && !(istPunkt && naeherAnErledigtemPunkt(p, start));
  gefuehrt.versuch = { punkte: [p], folgt, startFortschritt: gefuehrt.fortschritt };
  // Punkte (i, j, Umlaute): antippen reicht
  if (folgt && istPunkt) strichFertig();
}

function gefuehrtBewegung(p) {
  const v = gefuehrt.versuch;
  if (!v) return;
  lauflicht.letzteAktivitaet = performance.now();
  if (v.unterwegs) {
    unterwegsAngekommen(p);
    return;
  }
  v.punkte.push(p);
  if (!v.folgt) return;
  const pfad = gefuehrt.pfade[gefuehrt.nr];
  const b = gefuehrt.breite;
  const treffer = projizieren(pfad, p, gefuehrt.fortschritt - b, gefuehrt.fortschritt + 2.5 * b);
  if (treffer.d > abrutschGrenze()) {
    abgerutscht();
    return;
  }
  if (treffer.d <= spurToleranz() && treffer.s > gefuehrt.fortschritt) {
    gefuehrt.fortschritt = treffer.s;
    vibrieren(10, 70);
    startpunktZeigen(punktBei(pfad, gefuehrt.fortschritt));
  }
  // Erst fertig, wenn der Finger wirklich am Ende ist (kleiner Spielraum, sonst fehlt z. B. beim j das Hakenende)
  if (gefuehrt.fortschritt >= pfad.L - b * 0.2) strichFertig();
}

// Finger ist nach einem fertigen Strich liegen geblieben: am Startpunkt des nächsten Strichs geht es weiter
function unterwegsAngekommen(p) {
  const v = gefuehrt.versuch;
  if (istPunktStrich(gefuehrt.pfade[gefuehrt.nr])) naechstenPunktWaehlen(p);
  const pfad = gefuehrt.pfade[gefuehrt.nr];
  const start = punktBei(pfad, gefuehrt.fortschritt);
  // Nach einem Punkt zählt der nächste erst, wenn der Finger näher an ihm ist als am alten Punkt
  if (istPunktStrich(pfad) && naeherAnErledigtemPunkt(p, start)) return;
  // Hinfahren (statt Antippen): normaler Trefferbereich, damit nichts "im Vorbeifahren" abgehakt wird
  if (Math.hypot(p.x - start.x, p.y - start.y) > fangRadius()) return;
  const istPunkt = istPunktStrich(pfad);
  gefuehrt.versuch = { punkte: [p], folgt: true, startFortschritt: gefuehrt.fortschritt };
  if (istPunkt) strichFertig();
}

function gefuehrtEnde() {
  lauflicht.letzteAktivitaet = performance.now();
  lauflicht.zyklusStart = performance.now();    // Lauflicht startet neu ab der Stelle, an der es weitergeht
  const v = gefuehrt.versuch;
  gefuehrt.versuch = null;
  if (!v) return;
  // Gültige Spur bleibt stehen (Finger absetzen und weitermachen ist erlaubt), alles andere verschwindet
  if (v.folgt) gefuehrt.spuren.push(v.punkte);
  else if (v.unterwegs || v.fertig) { /* auf dem Weg zum nächsten Strich abgesetzt: nichts zu tun */ }
  else { spurenNeuZeichnen(); hinweisZeigen(); }
}

function abgerutscht() {
  vibrieren([30, 60, 30]);
  const v = gefuehrt.versuch;
  v.folgt = false;
  gefuehrt.fortschritt = v.startFortschritt;
  v.punkte = [];
  spurenNeuZeichnen();
  vorlageZeichnen();
  hinweisZeigen();
}

function strichFertig() {
  const v = gefuehrt.versuch;
  const pfad = gefuehrt.pfade[gefuehrt.nr];
  if (istPunktStrich(pfad)) {
    // Punkt geschafft: Farbe genau auf den Punkt (in seiner Form), auch wenn der Finger daneben getippt hat
    for (let i = 1; i < pfad.p.length; i++) linie(pfad.p[i - 1], pfad.p[i]);
    gefuehrt.spuren.push(pfad.p.slice());
    if (v) { v.punkte = []; v.folgt = false; v.fertig = true; }
  } else if (v) { gefuehrt.spuren.push(v.punkte); v.punkte = []; v.folgt = false; v.fertig = true; }
  vibrieren(35);
  gefuehrt.nr++;
  gefuehrt.fortschritt = 0;
  lauflicht.zyklusStart = performance.now();   // Licht beginnt am Start des nächsten Strichs
  klick();
  if (gefuehrt.nr >= gefuehrt.pfade.length) {
    startpunktZeigen(null);
    vorlageZeichnen();
    geschafft();
    return;
  }
  vorlageZeichnen();
  // Finger bleibt liegen (wie beim Schreiben): weiter zum nächsten Strich, ohne Spur auf dem Weg.
  // Beginnt der nächste Strich genau hier (z. B. u, B), geht es sofort weiter – außer nach einem Punkt,
  // sonst wäre bei ä/ö/ü mit dem ersten Punkt auch gleich der zweite erledigt.
  const finger = tafelZustand.letzter;
  const warPunkt = istPunktStrich(gefuehrt.pfade[gefuehrt.nr - 1]);
  if (v && tafelZustand.pointerId !== null && finger) {
    gefuehrt.versuch = { punkte: [], folgt: false, unterwegs: true };
    // Sofort weiter nur, wenn ein Strich genau hier beginnt – zu einem Punkt muss der Finger hinfahren
    if (!warPunkt && !istPunktStrich(gefuehrt.pfade[gefuehrt.nr])) unterwegsAngekommen(finger);
  }
}

function spurenNeuZeichnen() {
  funken = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const punkte of gefuehrt.spuren) {
    for (let i = 0; i < punkte.length; i++) linie(punkte[Math.max(0, i - 1)], punkte[i]);
  }
}

// Kurzer heller Ton, wenn ein Strich geschafft ist
function klick() {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator(), gain = c.createGain(), t = c.currentTime;
  osc.frequency.value = 880 + gefuehrt.nr * 110;
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

function hinweisZeigen() {
  const el = $('#startpunkt');
  el.classList.remove('hinweis-puls');
  void el.offsetWidth;
  el.classList.add('hinweis-puls');
}

// Grüner Punkt: hier geht es los (bzw. weiter), mit Nummer des Strichs
function startpunktZeigen(p) {
  const el = $('#startpunkt');
  if (!p) { el.hidden = true; return; }
  const groesse = Math.min(56, Math.max(40, gefuehrt.breite * 0.9));
  el.hidden = false;
  el.style.width = el.style.height = `${groesse}px`;
  el.style.left = `${p.x - groesse / 2}px`;
  el.style.top = `${p.y - groesse / 2}px`;
  el.textContent = gefuehrt.nr + 1;
}

function pfadZeichnen(c, pfad, bisS = pfad.L) {
  c.beginPath();
  c.moveTo(pfad.p[0].x, pfad.p[0].y);
  for (let i = 1; i < pfad.p.length && pfad.l[i - 1] < bisS; i++) {
    const q = pfad.l[i] <= bisS ? pfad.p[i] : punktBei(pfad, bisS);
    c.lineTo(q.x, q.y);
  }
  c.stroke();
}

function vorlageZeichnen() {
  const dpr = vorlage.width / tafelZustand.breite;
  const c = vorlageCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, vorlage.width, vorlage.height);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // Vierlinien-System wie im Schulheft
  const { oben, mitte, grund, unten, mitUnterlinie } = gefuehrt.linien;
  c.lineWidth = 2;
  for (const [y, gestrichelt] of [[oben, false], [mitte, true], [grund, false], ...(mitUnterlinie ? [[unten, false]] : [])]) {
    c.setLineDash(gestrichelt ? [8, 8] : []);
    c.strokeStyle = y === grund ? '#d9c9b0' : '#ece2d3';
    c.beginPath(); c.moveTo(12, y); c.lineTo(tafelZustand.breite - 12, y); c.stroke();
  }
  c.setLineDash([]);

  // Buchstabe: erst ein feiner Umriss um alle Striche, dann die Füllung (fertig hell, offen sandfarben)
  c.lineWidth = gefuehrt.breite + 4;
  c.strokeStyle = FARBE.umriss;
  gefuehrt.pfade.forEach((pfad) => pfadZeichnen(c, pfad));
  c.lineWidth = gefuehrt.breite;
  gefuehrt.pfade.forEach((pfad, i) => {
    c.strokeStyle = i < gefuehrt.nr ? FARBE.fertig : FARBE.offen;
    pfadZeichnen(c, pfad);
  });

  // Aktueller Strich: deutlich dunkler als die anderen
  const pfad = gefuehrt.pfade[gefuehrt.nr];
  if (!pfad) return;
  c.strokeStyle = FARBE.aktuell;
  pfadZeichnen(c, pfad);
  startpunktZeigen(lauflicht.vormachen ? null : punktBei(pfad, gefuehrt.fortschritt));
}

// ---------- Lauflicht ("Landebahn"): Pfeile leuchten nacheinander in Schreibrichtung auf ----------

const lauflicht = {
  vormachen: null,          // { start } solange der ganze Buchstabe einmal vorgemacht wird
  zyklusStart: 0,
  letzteAktivitaet: 0,
  erinnert: false,          // Erinnerung nach Untätigkeit schon gezeigt?
  erinnerungBis: 0,         // bis wann das Licht kräftiger leuchtet
  laeuft: false,
};
const LICHT_PAUSE = 0.9;        // Sekunden Pause zwischen zwei Durchläufen
const LICHT_NACHGLUEHEN = 0.55; // Sekunden, die ein Pfeil nach dem Aufleuchten nachglüht
const ERINNERUNG_NACH = 6000;   // ms ohne Berührung bis zur Erinnerung

const lichtTempo = () => Math.max(260, gefuehrt.breite * 6);   // Pixel pro Sekunde
const pfeilAbstand = () => Math.max(32, gefuehrt.breite * 1.8);

// Pfeil-Positionen auf einem Strich (ab "ab", z. B. ab dem bereits geschafften Teil)
function pfeilStellen(pfad, ab = 0) {
  const abstand = pfeilAbstand(), stellen = [];
  for (let s = abstand * 0.6; s < pfad.L - abstand * 0.3; s += abstand) if (s > ab) stellen.push(s);
  return stellen;
}

// Vormachen: wo ist das Licht nach t Sekunden? Striche nacheinander, mit kurzer Pause dazwischen.
function vormachenZustand(t) {
  const v = lichtTempo();
  for (let nr = 0; nr < gefuehrt.pfade.length; nr++) {
    const dauer = gefuehrt.pfade[nr].L / v;
    if (t <= dauer) return { nr, kopf: t * v };
    t -= dauer + 0.25;
    if (t < 0) return { nr, kopf: gefuehrt.pfade[nr].L };
  }
  return null;   // fertig
}

function vormachenStarten() {
  lauflicht.vormachen = { start: performance.now() };
  lauflicht.letzteAktivitaet = performance.now();
  lauflicht.erinnert = false;
  startpunktZeigen(null);
  lauflichtStarten();
}

function lauflichtStarten() {
  if (lauflicht.laeuft) return;
  lauflicht.laeuft = true;
  requestAnimationFrame(lauflichtSchritt);
}

function lichterLeeren() {
  lichterCtx.setTransform(1, 0, 0, 1, 0, 0);
  lichterCtx.clearRect(0, 0, lichter.width, lichter.height);
}

function lauflichtSchritt(jetzt) {
  if (lauflicht.eingefroren) { lauflicht.laeuft = false; return; }   // nur für Test-Screenshots
  // Nur zeichnen, solange geführt nachgespurt wird und die Tafel sichtbar ist
  if (!gefuehrt.aktiv || !$('#trace').classList.contains('active') || tafelZustand.geschafft) {
    lauflicht.laeuft = false;
    lichterLeeren();
    return;
  }
  lichterZeichnen(jetzt);
  requestAnimationFrame(lauflichtSchritt);
}

function lichterZeichnen(jetzt) {
  lichterLeeren();
  const dpr = lichter.width / tafelZustand.breite;
  const c = lichterCtx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const v = lichtTempo();

  // 1. Vormachen: alle Striche nacheinander, mit Geisterpunkt vorneweg
  if (lauflicht.vormachen) {
    const z = vormachenZustand((jetzt - lauflicht.vormachen.start) / 1000);
    if (!z) {
      lauflicht.vormachen = null;
      lauflicht.zyklusStart = jetzt;
      lauflicht.letzteAktivitaet = jetzt;
      vorlageZeichnen();               // jetzt Startpunkt zeigen
      return;
    }
    for (let nr = 0; nr <= z.nr; nr++) {
      const pfad = gefuehrt.pfade[nr];
      const kopf = nr < z.nr ? pfad.L : z.kopf;
      const zeitSeitEnde = nr < z.nr ? 1 : 0;   // frühere Striche: schon verglüht
      for (const s of pfeilStellen(pfad)) {
        if (s > kopf) continue;
        const glut = zeitSeitEnde ? 0.5 : Math.exp(-((kopf - s) / v) / LICHT_NACHGLUEHEN);
        pfeil(c, pfad, s, Math.max(0.5, glut), 1);
      }
    }
    const kopfPunkt = punktBei(gefuehrt.pfade[z.nr], z.kopf);
    geisterpunkt(c, kopfPunkt);
    return;
  }

  // 2. Nachspuren: Licht läuft auf dem aktuellen Strich ab der Stelle, an der es weitergeht
  const pfad = gefuehrt.pfade[gefuehrt.nr];
  if (!pfad) return;
  if (!lauflicht.erinnert && jetzt - lauflicht.letzteAktivitaet > ERINNERUNG_NACH && tafelZustand.pointerId === null) {
    lauflicht.erinnert = true;
    lauflicht.erinnerungBis = jetzt + 2500;
    lauflicht.zyklusStart = jetzt;
    hinweisZeigen();
  }
  const kraeftig = jetzt < lauflicht.erinnerungBis;
  const ab = gefuehrt.fortschritt;
  const dauer = (pfad.L - ab) / v;
  const t = ((jetzt - lauflicht.zyklusStart) / 1000) % (dauer + LICHT_PAUSE);
  const kopf = ab + t * v;
  for (const s of pfeilStellen(pfad, ab)) {
    // Noch nicht erreicht: schwach sichtbar (Landebahn "aus"); erreicht: hell, dann nachglühen
    const glut = s > kopf ? 0 : Math.exp(-((kopf - s) / v) / LICHT_NACHGLUEHEN);
    pfeil(c, pfad, s, 0.28 + 0.72 * glut, kraeftig ? 1.35 : 1);
  }
}

function pfeil(c, pfad, s, staerke, groesse) {
  const p = punktBei(pfad, s), q = punktBei(pfad, s + 1);
  const w = Math.atan2(q.y - p.y, q.x - p.x);
  const g = gefuehrt.breite * 0.42 * groesse * (0.85 + 0.25 * staerke);
  c.save();
  c.globalAlpha = Math.min(1, staerke);
  c.strokeStyle = FARBE.pfeil;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(3.5, gefuehrt.breite * 0.16) * groesse;
  if (staerke > 0.6) { c.shadowColor = 'rgba(242, 140, 56, 0.95)'; c.shadowBlur = 12 * staerke; }
  c.beginPath();
  c.moveTo(p.x - g * Math.cos(w - 0.6), p.y - g * Math.sin(w - 0.6));
  c.lineTo(p.x, p.y);
  c.lineTo(p.x - g * Math.cos(w + 0.6), p.y - g * Math.sin(w + 0.6));
  c.stroke();
  c.restore();
}

function geisterpunkt(c, p) {
  const r = Math.max(12, gefuehrt.breite * 0.38);
  c.save();
  c.shadowColor = 'rgba(29, 95, 191, 0.8)';
  c.shadowBlur = 18;
  c.fillStyle = '#ffffff';
  c.strokeStyle = FARBE.start;
  c.lineWidth = 4;
  c.beginPath();
  c.arc(p.x, p.y, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.restore();
}

// Zusammenhängende Flächen in einer Maske finden (4er-Nachbarschaft). Liefert Listen von Pixel-Indizes.
function flaechen(maske, breite) {
  const hoehe = maske.length / breite;
  const besucht = new Uint8Array(maske.length);
  const stapel = new Int32Array(maske.length);
  const ergebnis = [];
  for (let start = 0; start < maske.length; start++) {
    if (!maske[start] || besucht[start]) continue;
    const pixel = [];
    let oben = 0;
    stapel[oben++] = start;
    besucht[start] = 1;
    while (oben) {
      const i = stapel[--oben];
      pixel.push(i);
      const x = i % breite, y = (i - x) / breite;
      const nachbarn = [x > 0 ? i - 1 : -1, x < breite - 1 ? i + 1 : -1, y > 0 ? i - breite : -1, y < hoehe - 1 ? i + breite : -1];
      for (const n of nachbarn) {
        if (n >= 0 && maske[n] && !besucht[n]) { besucht[n] = 1; stapel[oben++] = n; }
      }
    }
    ergebnis.push(pixel);
  }
  return ergebnis;
}

// Einzelteile des Buchstabens (z. B. i-Punkt, Umlaut-Punkte) und Strichbreite für die Lücken-Prüfung
function buchstabenTeileAnalysieren() {
  const breite = pruef.spur.width;
  const ziel = pruef.ziel;
  let flaeche = 0, rand = 0;
  for (let i = 0; i < ziel.length; i++) {
    if (!ziel[i]) continue;
    flaeche++;
    const x = i % breite;
    if (x === 0 || x === breite - 1 || !ziel[i - 1] || !ziel[i + 1] || !ziel[i - breite] || !ziel[i + breite]) rand++;
  }
  // Bei langen, dünnen Strichen gilt: Fläche ≈ Breite × Länge, Umfang ≈ 2 × Länge
  pruef.strichbreite = rand ? (2 * flaeche) / rand : 1;
  pruef.teile = flaechen(ziel, breite).filter((t) => t.length >= 4);
}

function pruefen() {
  const daten = spurCtx.getImageData(0, 0, pruef.spur.width, pruef.spur.height).data;
  let ziel = 0, getroffen = 0, spur = 0, daneben = 0;
  for (let i = 0; i < pruef.ziel.length; i++) {
    const gemalt = daten[i * 4 + 3] > 128;
    if (pruef.ziel[i]) { ziel++; if (gemalt) getroffen++; }
    if (gemalt) { spur++; if (!pruef.erlaubt[i]) daneben++; }
  }
  if (!ziel || !spur) return;
  const abdeckung = getroffen / ziel;
  const danebenAnteil = daneben / spur;
  // Großzügig für 3- bis 4-Jährige: 75 % des Buchstabens getroffen, höchstens 25 % daneben ...
  if (abdeckung < 0.75 || danebenAnteil > 0.25) {
    tafelZustand.messung = { abdeckung, danebenAnteil };
    return;
  }
  const gemaltBei = (i) => daten[i * 4 + 3] > 128;
  // ... jedes Einzelteil (auch i-Punkt, Umlaut-Punkte) mindestens zur Hälfte nachgefahren ...
  const teilFehlt = pruef.teile.some((t) => t.filter(gemaltBei).length < t.length * 0.5);
  // ... und kein Stück ausgelassen (z. B. der Querstrich beim A). Erlaubt ist eine Lücke von 0,6 Strichbreiten²,
  // also etwa: am Strichende eine Strichbreite zu früh aufgehört
  const luecke = new Uint8Array(pruef.ziel.length);
  for (let i = 0; i < luecke.length; i++) luecke[i] = pruef.ziel[i] && !gemaltBei(i) ? 1 : 0;
  const groessteLuecke = Math.max(0, ...flaechen(luecke, pruef.spur.width).map((f) => f.length));
  const erlaubteLuecke = 0.6 * pruef.strichbreite * pruef.strichbreite;
  tafelZustand.messung = { abdeckung, danebenAnteil, teilFehlt, groessteLuecke, erlaubteLuecke };
  if (!teilFehlt && groessteLuecke <= erlaubteLuecke) geschafft();
}

function geschafft() {
  if (zustand.nameModus) { nameSchrittGeschafft(); return; }
  if (zustand.lektionSpur) { lektionSpurGeschafft(); return; }
  tafelZustand.geschafft = true;
  const eintrag = BUCHSTABEN[zustand.index];
  const freiVorher = freigeschaltet().size;
  const n = Math.min(MAX_STERNE, (zustand.sterne[eintrag.b] || 0) + 1);
  zustand.sterne[eintrag.b] = n;
  einstellungenSpeichern();
  spurBesuch.geschafft++;

  // Sticker fürs Album: das Wort, das gerade dran war
  const wahl = zustand.wahl && zustand.wahl.b === eintrag.b ? zustand.wahl : hauptWahl(eintrag);
  const neuerSticker = stickerVergeben(eintrag, wahl);

  glockenspiel();
  sterneFliegen();
  const jubel = $('#jubel');
  $('#jubel-bild').innerHTML = wahl.bild();
  jubel.classList.remove('zeigen', 'mit-sticker');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  if (neuerSticker) jubel.classList.add('mit-sticker');
  // Montessori: hat dieser Stern eine neue Gruppe freigeschaltet?
  const neueBuchstaben = freigeschaltet().size > freiVorher;
  jubel.classList.toggle('mit-schloss', neueBuchstaben);
  const danach = [
    ...(neuerSticker ? [{ url: 'audio/ansage-sticker.wav' }] : []),
    ...(neueBuchstaben ? [{ url: 'audio/ansage-neue-buchstaben.wav' }] : []),
  ];
  setTimeout(() => lautAbspielen(eintrag, true, danach), 500);

  // Danach neu starten, damit das Kind gleich nochmal üben kann – nach SPUR_ENDE_NACH Buchstaben ist Schluss
  // (🏠 groß / 🔁 klein wie in den anderen Spielen; sonst wäre das Hauptspiel eine „nur noch eins“-Schleife)
  clearTimeout(tafelZustand.jubelTimer);
  const warte = 2600 + (neuerSticker ? 800 : 0) + (neueBuchstaben ? 1200 : 0);
  tafelZustand.jubelTimer = setTimeout(() => {
    jubel.classList.remove('mit-sticker', 'mit-schloss');
    if (spurBesuch.geschafft >= SPUR_ENDE_NACH) {
      $('#jubel-bild').textContent = '🏆';
      spielEnde('trace', () => { spurBesuch.geschafft = 0; tafelLeeren(); });
      return;
    }
    jubel.classList.remove('zeigen');
    tafelLeeren();
  }, warte);
}

const SPUR_ENDE_NACH = 5;            // geschaffte Buchstaben je Besuch, dann ein Ende
const spurBesuch = { geschafft: 0 };   // zählt ab dem Öffnen der Buchstaben-Seite

function sterneFliegen() {
  const box = $('#sterne');
  box.innerHTML = '';
  const { breite, hoehe } = tafelZustand;
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.textContent = i % 3 ? '⭐' : '✨';
    const winkel = (i / 14) * Math.PI * 2;
    s.style.left = `${breite / 2 - 16}px`;
    s.style.top = `${hoehe / 2 - 16}px`;
    s.style.setProperty('--dx', `${Math.cos(winkel) * breite * 0.45}px`);
    s.style.setProperty('--dy', `${Math.sin(winkel) * hoehe * 0.45}px`);
    s.style.animationDelay = `${(i % 4) * 0.05}s`;
    box.appendChild(s);
  }
  setTimeout(() => { box.innerHTML = ''; }, 1600);
}

// ---------- Mein Name: den eigenen Namen Buchstabe für Buchstabe nachspuren ----------

// Wie in der Schule: erster Buchstabe groß, Rest klein; Zeichen ohne Strichdaten (z. B. "-") werden übersprungen
function nameZeichen(name) {
  // NFC: iPhones speichern Umlaute manchmal als Buchstabe + Pünktchen
  return [...name.normalize('NFC').trim()]
    .map((c, i) => (i === 0 ? (c === 'ß' ? 'ẞ' : c.toUpperCase()) : c.toLowerCase()))
    .filter((c) => STRICHE[c]);
}

function nameLeisteZeichnen() {
  const n = zustand.nameModus;
  const leiste = $('#name-leiste');
  leiste.hidden = !n;
  if (!n) return;
  leiste.innerHTML = n.zeichen.map((c, i) =>
    `<span class="${i < n.pos ? 'fertig' : i === n.pos ? 'aktuell' : ''}">${strichSvg(c, [-26, 148], 40)}</span>`).join('');
}

// Für Farbe der Spur und den Laut: der passende Eintrag im Alphabet
function nameSchrittZeigen() {
  const n = zustand.nameModus;
  const c = n.zeichen[n.pos];
  const klein = c === 'ẞ' ? 'ß' : c.toLowerCase();
  zustand.index = Math.max(0, BUCHSTABEN.findIndex((e) => e.b === klein));
  nameLeisteZeichnen();
  requestAnimationFrame(tafelAufbauen);
  folgeAbspielen([{ url: `audio/${dateiName(BUCHSTABEN[zustand.index].b)}-laut.wav` }]);
}

// Namen zum Nachspuren: zuerst das Kind selbst, dann Geschwister und „Meine Leute“ (Oma, Papa …).
// Fremde Namen nur aus einem Wort, das die Tafel ganz schreiben kann, und höchstens NAMEN_HOECHSTENS.
const NAMEN_HOECHSTENS = 6;
const nameTaugt = (n) => /^\S{2,8}$/.test(n.normalize('NFC').trim()) && nameZeichen(n).length === [...n.normalize('NFC').trim()].length;
function namenZumSpuren() {
  const k = aktivesKind();
  if (!k || !nameZeichen(k.name).length) return [];
  const kachel = (url, ersatz) => (url ? `<img class="kiste-foto" src="${url}" alt="">` : htmlText(ersatz || '') || '🙂');
  const liste = [{ name: k.name, eigen: true, bild: kindBildHtml(k), kachel: kachel(kindFotos[k.id], k.tier), stimme: k.nameStimme }];
  // Geschwister nach derselben Regel wie der eigene Name (sonst sieht eins das andere, aber nicht umgekehrt)
  kinder.filter((x) => x.id !== k.id && nameZeichen(x.name || '').length).forEach((x) => liste.push({
    name: x.name, bild: kindBildHtml(x) || '🙂', kachel: kachel(kindFotos[x.id], x.tier), stimme: x.nameStimme }));
  // „Meine Leute“ nur, wenn die Eltern es je Person erlaubt haben (w.name), z. B. nicht bei jemandem, der nicht mehr kommt
  eigeneKistenWoerter.filter((w) => w.kiste === 'leute' && w.name && kistenWortFertig(w) && nameTaugt(w.wort)).forEach((w) => {
    const m = medien[`w-${w.id}`];
    liste.push({ name: w.wort, bild: `<img class="bild-datei foto" src="${m.bildUrl}" alt="">`, kachel: kachel(m.bildUrl), stimme: m.stimme });
  });
  const gleich = (a, b) => a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
  return liste.filter((p, i) => liste.findIndex((q) => gleich(p, q)) === i).slice(0, NAMEN_HOECHSTENS);
}

function nameStarten() {
  const namen = namenZumSpuren();
  if (!namen.length) return;
  if (namen.length === 1) { nameSpurStarten(namen[0]); return; }
  // Auswahl über Gesichter (Kinder können nicht lesen): das eigene steht vorn
  const box = $('#name-wahl-raster');
  box.innerHTML = '';
  namen.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'spiel-btn kiste-wahl-btn';
    btn.innerHTML = p.kachel;
    btn.setAttribute('aria-label', p.name);
    btn.addEventListener('click', () => { audio(); nameSpurStarten(p, false); });
    box.appendChild(btn);
  });
  zeigen('name-wahl');
  folgeAbspielen([{ url: 'audio/ansage-name-aussuchen.wav' }], 'Such dir einen Namen aus!');
}

function nameSpurStarten(person, verlauf = true) {
  zustand.nameModus = { zeichen: nameZeichen(person.name), pos: 0, person };
  zustand.wahl = null;
  $('#bild').innerHTML = person.bild;
  $('#fortschritt').textContent = '';
  // Aus der Auswahl: die Auswahl im Verlauf ersetzen (Zurück führt dann zur Startseite)
  if (verlauf) zeigen('trace');
  else { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'trace')); history.replaceState({ screen: 'trace' }, ''); }
  nameSchrittZeigen();
  // Zum Start einmal den Namen hören, falls aufgenommen
  if (person.stimme) folgeAbspielen([blobQuelle(person.stimme)]);
}

function nameSchrittGeschafft() {
  tafelZustand.geschafft = true;
  const n = zustand.nameModus;
  n.pos++;
  glockenspiel();
  sterneFliegen();
  nameLeisteZeichnen();
  clearTimeout(tafelZustand.jubelTimer);
  if (n.pos < n.zeichen.length) {
    tafelZustand.jubelTimer = setTimeout(nameSchrittZeigen, 1300);
    return;
  }
  // Ganzer Name geschafft: großer Jubel mit dem Bild der Person, Lob und (falls aufgenommen) dem Namen
  const p = n.person;
  const jubel = $('#jubel');
  $('#jubel-bild').innerHTML = p.bild || '🏆';
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  // Fremder Name: erst der Name als Ergebnis („Oma“), dann das Lob für das Kind, das gespurt hat
  folgeAbspielen(p.eigen ? [lobQuelle(), ...(p.stimme ? [blobQuelle(p.stimme)] : [])]
    : [...(p.stimme ? [blobQuelle(p.stimme)] : []), ...lobMitName()], 'Super!');
  tafelZustand.jubelTimer = setTimeout(() => {
    jubel.classList.remove('zeigen');
    zustand.nameModus = null;
    nameLeisteZeichnen();
    zurStartseite();
  }, 3600);
}

function nameModusBeenden() {
  zustand.nameModus = null;
  nameLeisteZeichnen();
}
$('#btn-name-wahl-home').addEventListener('click', zurStartseite);

// vonKachel: das Bild der Kachel (Hauptwort) zeigen; weitere Wörter kommen beim Wiederholen und mit ➡️
function buchstabeOeffnen(i, verlauf = true, vonKachel = false) {
  nameModusBeenden();
  const gleicherBuchstabe = zustand.index === i && zustand.wahl;
  zustand.index = i;
  const eintrag = BUCHSTABEN[i];
  zustand.wahl = vonKachel ? hauptWahl(eintrag) : wortWaehlen(eintrag, gleicherBuchstabe ? zustand.wahl : null);
  $('#bild').innerHTML = zustand.wahl.bild();
  $('#fortschritt').textContent = '';   // keine (leeren) Sterne vor dem Kind – Fortschritt sehen die Eltern
  if (!zustand.lektionSpur && !zustand.nameModus) spielEndeWeg('trace');
  if (!$('#trace').classList.contains('active')) zeigen('trace', verlauf);
  // Layout erst nach dem Anzeigen messen
  requestAnimationFrame(tafelAufbauen);
  lautAbspielen(eintrag);
}

$('#btn-home').addEventListener('click', zurStartseite);
$('#btn-weiter').addEventListener('click', () => {
  // In „Zeig mir“: ohne Spuren zurück zur Lektion (niemand bleibt hängen)
  if (zustand.lektionSpur) { lektionSpurZurueck(); return; }
  // Bei "Mein Name": zum nächsten Buchstaben des Namens (überspringen)
  if (zustand.nameModus) {
    if (zustand.nameModus.pos < zustand.nameModus.zeichen.length - 1) { zustand.nameModus.pos++; nameSchrittZeigen(); }
    return;
  }
  const reihe = buchstabenReihenfolge();
  const frei = freigeschaltet();
  const pos = reihe.indexOf(zustand.index);
  for (let schritt = 1; schritt <= reihe.length; schritt++) {
    const i = reihe[(pos + schritt) % reihe.length];
    if (frei.has(BUCHSTABEN[i].b)) { buchstabeOeffnen(i); return; }
  }
});
$('#btn-loeschen').addEventListener('click', tafelLeeren);

function farbwahlZeichnen() {
  const box = $('#farbwahl');
  box.innerHTML = '';
  FARB_AUSWAHL.forEach((f) => {
    const btn = document.createElement('button');
    const besonders = ['bunt', 'regenbogen', 'glitzer'].includes(f);
    btn.className = `farbe-tupfer${besonders ? ` ${f}` : ''}${(zustand.farbe || 'bunt') === f ? ' gewaehlt' : ''}`;
    if (!besonders) btn.style.background = f;
    if (f === 'glitzer') btn.textContent = '✨';
    btn.setAttribute('aria-label', { bunt: 'bunt gemischt', regenbogen: 'Regenbogen', glitzer: 'Glitzer' }[f] || 'Farbe');
    btn.addEventListener('click', () => {
      zustand.farbe = f;
      regenbogenWeg = 0;
      einstellungenSpeichern();
      box.hidden = true;
      if (gefuehrt.aktiv) spurenNeuZeichnen();   // schon Gemaltes in der neuen Farbe zeigen
    });
    box.appendChild(btn);
  });
}

$('#btn-farbe').addEventListener('click', () => {
  const box = $('#farbwahl');
  if (box.hidden) farbwahlZeichnen();
  box.hidden = !box.hidden;
});
$('#btn-laut').addEventListener('click', () => (zustand.nameModus ? nameLautWiederholen() : lautAbspielen(BUCHSTABEN[zustand.index])));
function nameLautWiederholen() {
  folgeAbspielen([{ url: `audio/${dateiName(BUCHSTABEN[zustand.index].b)}-laut.wav` }]);
}
$('#btn-bild').addEventListener('click', () => {
  const karte = $('#btn-bild');
  karte.classList.remove('wackeln');
  void karte.offsetWidth;
  karte.classList.add('wackeln');
  if (zustand.nameModus) {
    const p = zustand.nameModus.person;
    if (p.stimme) folgeAbspielen([blobQuelle(p.stimme)]);
    else nameLautWiederholen();
    return;
  }
  lautAbspielen(BUCHSTABEN[zustand.index]);
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if ($('#trace').classList.contains('active')) tafelAufbauen();
  }, 150);
});

// ---------- Elternbereich (2 Sekunden gedrückt halten) ----------

(() => {
  const btn = $('#btn-eltern');
  let timer = null;
  const abbrechen = () => { clearTimeout(timer); btn.classList.remove('halten'); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.add('halten');
    timer = setTimeout(() => { abbrechen(); elternOeffnen(); }, 2000);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, abbrechen));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
})();

async function elternOeffnen() {
  document.querySelectorAll('input[name="schreibweise"]').forEach((r) => {
    r.checked = r.value === zustand.schreibweise;
  });
  document.querySelectorAll('input[name="reihenfolge"]').forEach((r) => {
    r.checked = r.value === (zustand.reihenfolge || 'alphabet');
  });
  const gesamt = BUCHSTABEN.reduce((sum, e) => sum + (zustand.sterne[e.b] || 0), 0);
  const fertig = BUCHSTABEN.filter((e) => (zustand.sterne[e.b] || 0) >= MAX_STERNE).length;
  const sticker = new Set(zustand.album || []);
  $('#fortschritt-text').textContent =
    `${gesamt} Sterne gesammelt, ${fertig} von ${BUCHSTABEN.length} Buchstaben mit allen ${MAX_STERNE} Sternen, `
    + `${alleSticker().filter((x) => sticker.has(x.key)).length} von ${alleSticker().length} Stickern im Album.`;
  // Alle Buchstaben mit Sternen (die Kinder sehen sie nicht mehr auf den Kacheln); 🔒 = noch nicht eingeführt
  const frei = freigeschaltet();
  const reihe = montessori() ? MONTESSORI_GRUPPEN.flat() : BUCHSTABEN.map((e) => e.b);
  $('#fortschritt-buchstaben').innerHTML = reihe.map((b) => {
    const n = zustand.sterne[b] || 0;
    return `<span class="${frei.has(b) ? '' : 'zu'}"><b>${b}</b>${frei.has(b) ? '⭐'.repeat(n) || '·' : '🔒'}</span>`;
  }).join('');
  await elternZeichnen();
  zeigen('eltern');
}

function pauseWahlZeichnen() {
  const box = $('#pause-wahl');
  const aktuell = speicher.lesen('pauseNach', 0);
  box.innerHTML = '';
  [0, 10, 15, 20].forEach((min) => {
    const btn = document.createElement('button');
    btn.className = `regal-spiel${min === aktuell ? ' gewaehlt' : ''}`;
    btn.textContent = min ? `nach ${min} Minuten` : 'aus';
    btn.setAttribute('aria-pressed', min === aktuell);
    btn.addEventListener('click', () => { speicher.schreiben('pauseNach', min); pauseWahlZeichnen(); });
    box.appendChild(btn);
  });
}

function spieleWahlZeichnen() {
  pauseWahlZeichnen();
  $('#zu-zweit').checked = speicher.lesen('zuZweit', false);
  $('#reim-hoeren').checked = !!zustand.reimHoeren;
  regalWahlZeichnen($('#spiele-wahl'), zustand.spiele || ALLE_SPIELE, (neu) => {
    zustand.spiele = neu;
    einstellungenSpeichern();
    spieleWahlZeichnen();
  });
}

async function elternZeichnen() {
  spieleWahlZeichnen();
  // Lob-Plätze nur mit eigenem Profil (sonst wiederholt die Karte nur „eigenes Profil anlegen“)
  $('#lob').closest('.karte').hidden = zustand.profil === STANDARD.id;
  kinderListeZeichnen();
  sicherungZusammenfassung();
  // Teilen-Knopf nur, wo das Gerät Dateien teilen kann (z. B. Android)
  $('#btn-teilen').hidden = !(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }));
  // Schrift und Fortschritt gibt es mit Kindern pro Kind (beim Kind einstellen)
  $('#karte-schrift').hidden = kinder.length > 0;
  $('#karte-fortschritt').hidden = kinder.length > 0;
  $('#profil-kinder-hinweis').hidden = kinder.length === 0;
  await profileZeichnen();
  medienZeichnen();
}

// Im Elternbereich kann ein anderes Profil zum Bearbeiten gewählt sein: beim Verlassen wieder das des Kindes laden
async function elternVerlassen() {
  einstellungenLaden();
  await medienLaden();
}

function medienZeichnen() {
  lobZeichnen();
  anpassenZeichnen();
}

document.querySelectorAll('input[name="schreibweise"]').forEach((r) => {
  r.addEventListener('change', () => {
    zustand.schreibweise = r.value;
    einstellungenSpeichern();
    medienZeichnen();
  });
});

$('#btn-eltern-zurueck').addEventListener('click', () => { stopAufnahme(); zurStartseite(); });

// --- Kinder ---

// „übt gerade m a s l“ (Montessori: aktuelle Gruppe) bzw. „alle Buchstaben“ (A–Z)
function uebtGerade(k) {
  if ((k.reihenfolge || 'alphabet') !== 'montessori') return 'alle Buchstaben (A–Z)';
  const sterne = k.sterne || {};
  const gruppe = MONTESSORI_GRUPPEN.find((g) => !g.every((b) => (sterne[b] || 0) >= FREI_AB_STERNEN));
  return gruppe ? `übt gerade ${gruppe.join(' ')}` : 'kann alle Gruppen';
}

function kinderListeZeichnen() {
  const box = $('#kinder-liste');
  box.innerHTML = '';
  kinder.forEach((k) => {
    // Beschreiben statt zählen: keine Sterne-Summen nebeneinander (sonst vergleichen sich Geschwister)
    const zeile = document.createElement('button');
    zeile.className = 'kind-zeile';
    zeile.innerHTML = `<span class="kind-bild">${kindBildHtml(k)}</span>`
      + `<span class="w">${htmlText(k.name)}<br><small>${k.schreibweise === 'gross' ? 'GROSSE' : 'kleine'} Buchstaben`
      + ` · ${uebtGerade(k)}</small></span><span class="pfeil">✏️</span>`;
    zeile.addEventListener('click', () => kindBearbeiten(k.id));
    box.appendChild(zeile);
  });
}

// Neues Kind: Name abfragen, anlegen, Formular öffnen; gibt das Kind zurück (oder null bei Abbruch)
async function kindNeu() {
  const name = (prompt('Wie heißt das Kind?') || '').trim();
  if (!name) return null;
  const erstesKind = kinder.length === 0;
  const kind = {
    id: `k-${Date.now().toString(36)}`,
    name: name.slice(0, 20),
    tier: TIERE.find((t) => !kinder.some((k) => k.tier === t)) || TIERE[0],
    // Das erste Kind übernimmt die bisherigen Sterne und Einstellungen
    schreibweise: erstesKind ? speicher.lesen('schreibweise', 'klein') : 'klein',
    sterne: erstesKind ? speicher.lesen('sterne', {}) : {},
    profil: erstesKind ? speicher.lesen('profil', STANDARD.id) : STANDARD.id,
    album: erstesKind ? speicher.lesen('album', []) : [],
    reihenfolge: erstesKind ? speicher.lesen('reihenfolge', reihenfolgeStandard()) : 'montessori',
    farbe: erstesKind ? speicher.lesen('farbe', 'bunt') : 'bunt',
    reimHoeren: erstesKind ? speicher.lesen('reimHoeren', false) : false,
    spieleAus: erstesKind ? appWeitAus() : START_AUS,
    funde: erstesKind ? speicher.lesen('funde', []) : [],
    erstellt: Date.now(),
  };
  await datenbank.kindSpeichern(kind);
  speicherSchuetzen();
  if (erstesKind) {
    speicher.schreiben('sterne', {}); speicher.schreiben('album', []); speicher.schreiben('funde', []);
    await fundeUmziehen('ohne', kind.id);   // Fotos der Buchstaben-Jagd gehören jetzt dem Kind
  }
  await kinderLaden();
  if (!aktivesKind()) { zustand.kind = kind.id; speicher.schreiben('kind', kind.id); }
  kindBearbeiten(kind.id);
  return kind;
}
$('#btn-kind-neu').addEventListener('click', kindNeu);

let kindInArbeit = null;

function kindBearbeiten(id) {
  kindInArbeit = kinder.find((k) => k.id === id);
  if (!kindInArbeit) return;
  kindFormularZeichnen();
  zeigen('kind');
}

async function kindAendern(fn) {
  fn(kindInArbeit);
  await datenbank.kindSpeichern(kindInArbeit);
  // Neu laden, damit Liste, Fotos und aktives Kind denselben Stand haben
  await kinderLaden();
  kindInArbeit = kinder.find((k) => k.id === kindInArbeit.id);
  if (kindInArbeit.id === zustand.kind) {
    zustand.schreibweise = kindInArbeit.schreibweise;
    zustand.sterne = kindInArbeit.sterne;
    zustand.album = kindInArbeit.album || [];
    zustand.reihenfolge = kindInArbeit.reihenfolge || 'alphabet';
    zustand.farbe = kindInArbeit.farbe || 'bunt';
    zustand.reimHoeren = !!kindInArbeit.reimHoeren;
    zustand.spiele = regalVon(regalAus(kindInArbeit) || []);
    zustand.funde = kindInArbeit.funde || [];
  }
  kindFormularZeichnen();
}

async function kindFormularZeichnen() {
  const k = kindInArbeit;
  $('#kind-titel').textContent = k.name;
  const name = $('#kind-name');
  if (document.activeElement !== name) name.value = k.name;

  const tiere = $('#kind-tiere');
  tiere.innerHTML = '';
  TIERE.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'tier' + (!k.foto && k.tier === t ? ' gewaehlt' : '');
    btn.textContent = t;
    btn.addEventListener('click', () => kindAendern((kk) => { kk.tier = t; kk.foto = null; }));
    tiere.appendChild(btn);
  });
  $('#btn-kind-foto-weg').hidden = !k.foto;

  document.querySelectorAll('input[name="kind-schreibweise"]').forEach((r) => { r.checked = r.value === k.schreibweise; });
  document.querySelectorAll('input[name="kind-reihenfolge"]').forEach((r) => { r.checked = r.value === (k.reihenfolge || 'alphabet'); });
  $('#kind-reim-hoeren').checked = !!k.reimHoeren;
  regalWahlZeichnen($('#kind-spiele'), regalVon(regalAus(k) || []), (neu) => kindAendern((kk) => { kk.spieleAus = ausVon(neu); delete kk.spiele; }));

  const profile = [STANDARD, ...(await datenbank.profile())];
  const fotos = await menschenFotos(profile);
  const box = $('#kind-profile');
  box.innerHTML = '';
  profile.forEach((p) => {
    const zeile = document.createElement('label');
    zeile.className = 'umschalter profil-zeile';
    zeile.innerHTML = `<input type="radio" name="kind-profil" ${p.id === k.profil ? 'checked' : ''}>`
      + `${menschBild(p, fotos)}<span>${htmlText(p.name)}</span>`;
    zeile.querySelector('input').addEventListener('change', async () => {
      await kindAendern((kk) => { kk.profil = p.id; kk.lobGaeste = (kk.lobGaeste || []).filter((id) => id !== p.id); });
    });
    box.appendChild(zeile);
  });
  // Gäste beim Lob: nur Menschen mit aufgenommenem Lob und einem Namen, der mit einem Buchstaben beginnt
  const zeilen = [];
  const andere = profile.filter((p) => p.id !== STANDARD.id && p.id !== k.profil);
  for (const p of andere) {
    const lob = (await datenbank.medienVon(p.id)).filter((m) => /\|lob-[1-9]\|stimme$/.test(m.schluessel)).length;
    const b = anfangsBuchstabe(p.name);
    const zeile = document.createElement('label');
    zeile.className = 'umschalter profil-zeile';
    const an = (k.lobGaeste || []).includes(p.id);
    const gross = b && b.toUpperCase();
    // Hinweise: Anlaut klingt anders (Christa, Stefan …), Buchstabe in der Montessori-Reihenfolge noch nicht dran
    const unsauber = /^(sch|ch|st|sp|ph|ei|eu|au|c)/i.test(p.name.trim()) ? ` (klingt nicht wie „${gross}“ – lobt trotzdem dort)` : '';
    const nochNicht = b && !freiFuer(k).has(b) ? ` – „${gross}“ ist für ${htmlText(k.name)} noch nicht dran` : '';
    zeile.innerHTML = `<input type="checkbox" ${an ? 'checked' : ''} ${lob && b ? '' : 'disabled'}>${menschBild(p, fotos)}`
      + `<span>${htmlText(p.name)}<br><small>${!lob ? `noch kein Lob – unter „Menschen“ ${htmlText(p.name)} wählen und bei „Lob“ aufnehmen`
        : !b ? 'Name beginnt nicht mit einem Buchstaben' : `lobt beim „${gross}“${unsauber}${nochNicht}`}</small></span>`;
    zeile.querySelector('input').addEventListener('change', async (e) => {
      const an2 = e.target.checked;
      const setzen = (kk) => { kk.lobGaeste = [...new Set([...(kk.lobGaeste || []).filter((id) => id !== p.id), ...(an2 ? [p.id] : [])])]; };
      await kindAendern(setzen);
      // Geschwister gleich behandeln (sonst lobt Oma das eine Kind und das andere nie)
      const geschwister = kinder.filter((x) => x.id !== k.id && x.profil !== p.id && (x.lobGaeste || []).includes(p.id) !== an2);
      if (geschwister.length && confirm(`Auch bei ${geschwister.map((x) => x.name).join(' und ')}?`)) {
        for (const x of geschwister) { setzen(x); await datenbank.kindSpeichern(x); }
        await kinderLaden();
        kindInArbeit = kinder.find((x) => x.id === k.id);
      }
      if (kinder.some((x) => x.id === zustand.kind)) await gastLobLaden();
    });
    zeilen.push(zeile);
  }
  // Erst ganz aufbauen, dann einsetzen (zwei schnelle Änderungen hintereinander dürfen keine Zeilen verdoppeln)
  $('#kind-gaeste').replaceChildren(...zeilen);
  $('#kind-gaeste-karte').hidden = !andere.length;
  Object.values(fotos).forEach((url) => setTimeout(() => URL.revokeObjectURL(url), 60000));

  $('#kind-name-status').innerHTML = k.nameStimme
    ? `<b>Aufgenommen.</b> Das Lob klingt dann z. B. „Toll gemacht! … ${htmlText(k.name)}!“`
    : 'Noch nicht aufgenommen – das Lob kommt dann ohne Namen.';
  $('#btn-kind-name-anhoeren').disabled = !k.nameStimme;
  $('#btn-kind-name-weg').disabled = !k.nameStimme;

  const sterne = Object.values(k.sterne || {}).reduce((a, b) => a + b, 0);
  const fertig = BUCHSTABEN.filter((e) => (k.sterne[e.b] || 0) >= MAX_STERNE).length;
  $('#kind-sterne').textContent =
    `${uebtGerade(k)[0].toUpperCase()}${uebtGerade(k).slice(1)}. ${sterne} Sterne gesammelt, ${fertig} von ${BUCHSTABEN.length} Buchstaben `
    + `mit allen ${MAX_STERNE} Sternen, ${alleSticker().filter((x) => (k.album || []).includes(x.key)).length} von ${alleSticker().length} Stickern.`;
}

$('#kind-name').addEventListener('change', (e) => {
  const name = e.target.value.trim().slice(0, 20);
  if (name) kindAendern((k) => { k.name = name; });
  else e.target.value = kindInArbeit.name;
});

document.querySelectorAll('input[name="kind-schreibweise"]').forEach((r) => {
  r.addEventListener('change', () => kindAendern((k) => { k.schreibweise = r.value; }));
});

document.querySelectorAll('input[name="kind-reihenfolge"]').forEach((r) => {
  r.addEventListener('change', () => kindAendern((k) => { k.reihenfolge = r.value; }));
});
$('#kind-reim-hoeren').addEventListener('change', (e) => kindAendern((k) => { k.reimHoeren = e.target.checked; }));
$('#reim-hoeren').addEventListener('change', (e) => { zustand.reimHoeren = e.target.checked; einstellungenSpeichern(); });

document.querySelectorAll('input[name="reihenfolge"]').forEach((r) => {
  r.addEventListener('change', () => {
    zustand.reihenfolge = r.value;
    einstellungenSpeichern();
  });
});

$('#btn-kind-foto').addEventListener('click', () => fotoWaehlen((blob) => kindAendern((k) => { k.foto = blob; })));

$('#btn-kind-foto-weg').addEventListener('click', () => kindAendern((k) => { k.foto = null; }));

$('#btn-kind-name-aufnehmen').addEventListener('click', (e) => {
  aufnehmen(e.currentTarget, (blob) => kindAendern((k) => { k.nameStimme = blob; }));
});

// Probehören: ein Lob mit dem Namen dieses Kindes (Wort: Apfel)
$('#btn-kind-name-anhoeren').addEventListener('click', () => {
  folgeAbspielen(wiedergabeFolge(BUCHSTABEN[0], true, kindInArbeit));
});

$('#btn-kind-name-weg').addEventListener('click', () => kindAendern((k) => { k.nameStimme = null; }));

$('#btn-kind-sterne-reset').addEventListener('click', () => {
  if (!confirm(`Alle Sterne von ${kindInArbeit.name} zurücksetzen?`)) return;
  kindAendern((k) => { k.sterne = {}; });
});

$('#btn-kind-loeschen').addEventListener('click', async () => {
  if (!confirm(`${kindInArbeit.name} mit allen Sternen löschen?`)) return;
  await datenbank.kindLoeschen(kindInArbeit.id);
  await datenbank.profilLoeschen(`fund-${kindInArbeit.id}`);   // Fotos/Aufnahmen der Buchstaben-Jagd
  await kinderLaden();
  if (!aktivesKind()) {
    zustand.kind = kinder.length ? kinder[0].id : null;
    speicher.schreiben('kind', zustand.kind);
  }
  history.back();
});

$('#btn-kind-zurueck').addEventListener('click', () => history.back());

// --- Wer spielt? ---

function werZeichnen() {
  const box = $('#wer-liste');
  box.innerHTML = '';
  kinder.forEach((k) => {
    const btn = document.createElement('button');
    btn.className = 'wer-kachel';
    btn.innerHTML = `<span class="wer-bild">${kindBildHtml(k)}</span><span class="wer-name">${htmlText(k.name)}</span>`;
    btn.addEventListener('click', async () => {
      await kindWaehlen(k.id);
      rasterZeichnen();
      zeigen('home', false);
    });
    box.appendChild(btn);
  });
}

$('#btn-kind').addEventListener('click', () => {
  wiedergabeStoppen();
  werZeichnen();
  zeigen('wer', false);
});

$('#btn-reset').addEventListener('click', () => {
  if (!confirm('Alle Sterne wirklich zurücksetzen?')) return;
  zustand.sterne = {};
  einstellungenSpeichern();
  elternOeffnen();
});

// --- Profile ---

function htmlText(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// Fotos der Menschen (Profil-Medium „ich“), als Objekt-URLs je Profil-ID
async function menschenFotos(profile) {
  const fotos = {};
  for (const p of profile.filter((x) => x.id !== STANDARD.id)) {
    const m = (await datenbank.medienVon(p.id)).find((x) => x.schluessel === `${p.id}|ich|bild`);
    if (m) fotos[p.id] = URL.createObjectURL(m.blob);
  }
  return fotos;
}
const menschBild = (p, fotos) => `<span class="mensch-bild">${p.id === STANDARD.id ? '⭐'
  : fotos[p.id] ? `<img src="${fotos[p.id]}" alt="">` : '🙂'}</span>`;

async function profileZeichnen() {
  const liste = [STANDARD, ...(await datenbank.profile())];
  const fotos = await menschenFotos(liste);
  const box = $('#profile');
  box.innerHTML = '';
  liste.forEach((p) => {
    const zeile = document.createElement('label');
    zeile.className = 'umschalter profil-zeile';
    const beschreibung = p.id === STANDARD.id ? '<small>Stimme des App-Sprechers &amp; mitgelieferte Bilder</small>' : '';
    zeile.innerHTML = `<input type="radio" name="profil" value="${p.id}" ${p.id === zustand.profil ? 'checked' : ''}>`
      + `${menschBild(p, fotos)}<span>${htmlText(p.name)}${beschreibung ? '<br>' + beschreibung : ''}</span>`;
    zeile.querySelector('input').addEventListener('change', async () => {
      stopAufnahme();
      await profilAktivieren(p.id);
      elternZeichnen();
    });
    box.appendChild(zeile);
  });
  const eigenes = zustand.profil !== STANDARD.id;
  $('#btn-profil-umbenennen').hidden = !eigenes;
  $('#btn-profil-loeschen').hidden = !eigenes;
  $('#btn-profil-foto').hidden = !eigenes;
  const aktiv = liste.find((p) => p.id === zustand.profil);
  $('#btn-profil-foto').textContent = `📷 Foto von ${aktiv ? aktiv.name : ''}`;
  // Roter Faden für den markierten Menschen: Foto → Lob → beim Kind
  const stand = $('#mensch-stand');
  stand.hidden = !eigenes;
  if (eigenes) {
    const lob = (await datenbank.medienVon(aktiv.id)).filter((m) => /\|lob-[1-9]\|stimme$/.test(m.schluessel)).length;
    const haupt = kinder.filter((k) => k.profil === aktiv.id).map((k) => htmlText(k.name));
    const gast = kinder.filter((k) => (k.lobGaeste || []).includes(aktiv.id)).map((k) => htmlText(k.name));
    const name = htmlText(aktiv.name);
    stand.innerHTML = `Sie bearbeiten <b>${name}</b>:<br>`
      + `1. ${fotos[aktiv.id] ? '✅' : '⬜'} Foto von ${name}<br>`
      + `2. ${lob ? '✅' : '⬜'} Lob aufnehmen (${lob} von ${LOB_PLAETZE.length}) – <a href="#lob" data-a="lob">zum Lob ⬇️</a><br>`
      + `3. ${haupt.length || gast.length ? '✅' : '⬜'} beim Kind: ${[haupt.length ? `Hauptstimme für ${haupt.join(', ')}` : '',
        gast.length ? `lobt ab und zu ${gast.join(', ')}` : ''].filter(Boolean).join('; ') || (kinder.length ? 'noch bei keinem Kind (Kinder → Kind antippen)' : 'gilt für die ganze App')}`;
    stand.querySelector('[data-a=lob]').addEventListener('click', (e) => { e.preventDefault(); $('#lob').scrollIntoView({ behavior: 'smooth' }); });
  }
  Object.values(fotos).forEach((url) => setTimeout(() => URL.revokeObjectURL(url), 60000));
}

// Foto der Person (erscheint klein, wenn sie als Gast lobt, und in den Listen)
$('#btn-profil-foto').addEventListener('click', () => {
  const profil = zustand.profil;
  fotoWaehlen(async (blob) => {
    await datenbank.medienSetzen(profil, 'ich', 'bild', blob);
    await medienLaden();
    profileZeichnen();
  });
});

async function aktivesProfil() {
  return (await datenbank.profile()).find((p) => p.id === zustand.profil);
}

async function profilNeu() {
  const name = (prompt('Wer spricht? Name, z. B. Mama, Papa, Oma:') || '').trim();
  if (!name) return;
  const profil = { id: `p-${Date.now().toString(36)}`, name: name.slice(0, 30), erstellt: Date.now() };
  await datenbank.profilSpeichern(profil);
  // Browser bitten, Fotos und Aufnahmen nicht bei Speicherknappheit zu löschen
  speicherSchuetzen();
  await profilAktivieren(profil.id);
  // Mit Kindern immer fragen: Hauptstimme oder nur ab und zu loben (Oma soll nicht still alle Laute sprechen)
  for (const k of kinder) {
    if (confirm(`Soll „${profil.name}“ die Hauptstimme für ${k.name} sein (Laute, Wörter, Ansagen)?\n\n`
      + `OK = Hauptstimme.\nAbbrechen = „${profil.name}“ lobt ${k.name} nur ab und zu (sobald ein Lob aufgenommen ist).`)) {
      k.profil = profil.id;
      k.lobGaeste = (k.lobGaeste || []).filter((id) => id !== profil.id);
    } else {
      k.lobGaeste = [...new Set([...(k.lobGaeste || []), profil.id])];
    }
    await datenbank.kindSpeichern(k);
  }
  if (kinder.length) await kinderLaden();
  elternZeichnen();
}

$('#btn-profil-neu').addEventListener('click', profilNeu);

$('#btn-profil-umbenennen').addEventListener('click', async () => {
  const profil = await aktivesProfil();
  if (!profil) return;
  const name = (prompt('Neuer Name für das Profil:', profil.name) || '').trim();
  if (!name) return;
  profil.name = name.slice(0, 30);
  await datenbank.profilSpeichern(profil);
  profileZeichnen();
});

$('#btn-profil-loeschen').addEventListener('click', async () => {
  const profil = await aktivesProfil();
  if (!profil) return;
  if (!confirm(`Profil „${profil.name}“ mit allen eigenen Fotos und Aufnahmen löschen?`)) return;
  stopAufnahme();
  await datenbank.profilLoeschen(profil.id);
  // Kinder mit diesem Profil hören wieder den Standard
  for (const k of kinder.filter((kk) => kk.profil === profil.id || (kk.lobGaeste || []).includes(profil.id))) {
    if (k.profil === profil.id) k.profil = STANDARD.id;
    k.lobGaeste = (k.lobGaeste || []).filter((id) => id !== profil.id);
    await datenbank.kindSpeichern(k);
  }
  await profilAktivieren(STANDARD.id);
  elternZeichnen();
});

// --- Bilder & Stimme pro Buchstabe ---

function anpassenZeichnen() {
  const box = $('#anpassen');
  if (zustand.profil === STANDARD.id) {
    box.innerHTML = '<p class="hinweis">Das Profil „Standard“ bleibt immer unverändert. '
      + 'Legen Sie ein eigenes Profil an, um Fotos zu machen, die Laute mit Ihrer Stimme aufzunehmen und eigene Kisten '
      + '(„Meine Leute“, „Meine Kita“) mit Ihren Menschen und Orten anzulegen.</p>'
      + '<button class="text-btn" data-a="neu">➕ Eigenes Profil anlegen</button>';
    box.querySelector('[data-a=neu]').addEventListener('click', profilNeu);
    return;
  }
  box.innerHTML = '<p class="hinweis">Am einfachsten: Laute, Wörter, Lob und mehr einmal selbst einsprechen – die App '
    + 'nutzt Ihre Stimme dann in allen Spielen. Was Sie nicht aufnehmen, kommt aus „Standard“. Alles bleibt nur auf diesem Gerät.</p>'
    + '<button class="text-btn studio-start" data-a="studio">🎙️ Stimme einsprechen</button>'
    + '<p class="hinweis">Tipp: Fangen Sie mit den <b>Lauten</b> an (30 Stück, etwa 10 Minuten) – alles andere ist freiwillig.</p>'
    + '<details class="buchstaben-anpassen"><summary>Einzelne Buchstaben anpassen (Foto, ganze Ansage)</summary>'
    + '<p class="hinweis">Fotos und Aufnahmen je Buchstabe (die ganze Ansage, z. B. „mmm … mmm … Maus“):</p></details>';
  box.querySelector('[data-a=studio]').addEventListener('click', studioOeffnen);
  box.querySelector('.buchstaben-anpassen').before(eigeneKistenBox());
  const liste = box.querySelector('.buchstaben-anpassen');
  BUCHSTABEN.forEach((eintrag) => {
    const m = medien[eintrag.b] || {};
    const zeile = document.createElement('div');
    zeile.className = 'anpassen-zeile';
    zeile.innerHTML = `<span class="z">${zeichen(eintrag)}</span>`
      + `<span class="vorschau">${bildHtml(eintrag)}</span>`
      + `<span class="w">${eintrag.wort}<br><small>Bild: ${m.bildUrl ? '<b>eigenes Foto</b>' : 'Standard'}`
      + ` · Stimme: ${m.stimme ? '<b>eigene</b>' : 'Standard'}</small></span>`
      + '<div class="aktionen">'
      + '<span class="gruppe"><span class="gruppe-name">Bild</span>'
      + '<button class="mini-btn" data-a="foto" aria-label="Foto wählen">📷</button>'
      + `<button class="mini-btn" data-a="bild-weg" aria-label="Standard-Bild" ${m.bildUrl ? '' : 'disabled'}>↩️</button></span>`
      + '<span class="gruppe"><span class="gruppe-name">Stimme</span>'
      + '<button class="mini-btn" data-a="rec" aria-label="Aufnehmen">🎙️</button>'
      + '<button class="mini-btn" data-a="play" aria-label="Anhören">▶️</button>'
      + `<button class="mini-btn" data-a="stimme-weg" aria-label="Standard-Stimme" ${m.stimme ? '' : 'disabled'}>↩️</button></span>`
      + '</div>';
    const knopf = (a) => zeile.querySelector(`[data-a=${a}]`);
    knopf('foto').addEventListener('click', () => buchstabenFotoWaehlen(eintrag.b));
    knopf('bild-weg').addEventListener('click', () => medienEntfernen(eintrag.b, 'bild'));
    knopf('rec').addEventListener('click', (e) => medienAufnehmen(eintrag.b, e.currentTarget));
    knopf('play').addEventListener('click', () => folgeAbspielen(hauptWahl(eintrag).ansage()));
    knopf('stimme-weg').addEventListener('click', () => medienEntfernen(eintrag.b, 'stimme'));
    zeile.appendChild(eigeneWoerterBox(eintrag));
    liste.appendChild(zeile);
  });
}

// Persönliche Wörter eines Buchstabens: Foto + eigene Aufnahme des Wortes
function eigeneWoerterBox(eintrag) {
  const box = document.createElement('div');
  box.className = 'eigene-woerter';
  eigeneWoerter.filter((w) => w.b === eintrag.b).forEach((w) => {
    box.appendChild(eigenesWortZeile(w, () => {
      const wahl = woerterFuer(eintrag).find((x) => x.id === w.id);
      if (wahl) folgeAbspielen(wahl.ansage());
    }, () => eigenesWortLoeschen(w)));
  });
  const neu = document.createElement('button');
  neu.className = 'text-btn klein';
  neu.textContent = `➕ eigenes Wort mit „${zeichen(eintrag)}“`;
  neu.addEventListener('click', () => eigenesWortNeu(eintrag));
  box.appendChild(neu);
  return box;
}

// Eine Zeile „Foto · Wort · 📷 🎙️ ▶️ 🗑️“ (persönliche Wörter und eigene Kisten)
function eigenesWortZeile(w, abspielen, loeschen, fotoNoetig = false) {
  const m = medien[`w-${w.id}`] || {};
  const zeile = document.createElement('div');
  zeile.className = 'eigenes-wort';
  zeile.innerHTML = `<span class="vorschau">${m.bildUrl ? `<img class="bild-datei foto" src="${m.bildUrl}" alt="">` : '💛'}</span>`
    + `<span class="w">${htmlText(w.wort)}<br><small>${m.stimme ? '<b>aufgenommen</b>' : 'noch nicht aufgenommen'}${fotoNoetig && !m.bildUrl ? ' · Foto fehlt' : ''}</small></span>`
    + '<button class="mini-btn" data-a="foto" aria-label="Foto wählen">📷</button>'
    + '<button class="mini-btn" data-a="rec" aria-label="Wort aufnehmen">🎙️</button>'
    + `<button class="mini-btn" data-a="play" aria-label="Anhören" ${m.stimme ? '' : 'disabled'}>▶️</button>`
    + '<button class="mini-btn" data-a="weg" aria-label="Wort löschen">🗑️</button>';
  const knopf = (a) => zeile.querySelector(`[data-a=${a}]`);
  knopf('foto').addEventListener('click', () => buchstabenFotoWaehlen(`w-${w.id}`));
  knopf('rec').addEventListener('click', (e) => medienAufnehmen(`w-${w.id}`, e.currentTarget));
  knopf('play').addEventListener('click', abspielen);
  knopf('weg').addEventListener('click', loeschen);
  return zeile;
}

// Eigene Kisten im Elternbereich: je Kiste die Wörter mit Foto und Aufnahme
function eigeneKistenBox() {
  const box = document.createElement('div');
  box.className = 'eigene-kisten';
  box.innerHTML = '<h3>🧺 Eigene Kisten</h3><p class="hinweis">In der Wörterkiste lernt Ihr Kind auch Ihre Menschen und Orte: '
    + `„Das ist Oma.“ – „Wo ist Oma?“ – „Wer ist das?“. Eine Kiste erscheint, sobald ${KISTE_MIN} Wörter ein Foto und eine Aufnahme haben.</p>`;
  EIGENE_KISTEN.forEach((def) => {
    const alle = eigeneKistenWoerter.filter((w) => w.kiste === def.id);
    const fertig = alle.filter(kistenWortFertig).length;
    const teil = document.createElement('div');
    teil.className = 'eigene-kiste';
    teil.dataset.kiste = def.id;
    teil.innerHTML = `<h4>${def.bild} ${def.name} <small>${fertig >= KISTE_MIN ? '<b>im Spiel</b>' : `${fertig} von ${KISTE_MIN} fertig`}</small></h4>`
      + `<p class="hinweis">${htmlText(def.hinweis)}</p>`;
    const liste = document.createElement('div');
    liste.className = 'eigene-woerter';
    alle.forEach((w) => {
      liste.appendChild(eigenesWortZeile(w,
        () => { const m = medien[`w-${w.id}`]; if (m && m.stimme) folgeAbspielen([blobQuelle(m.stimme)]); },
        () => eigenesWortLoeschen(w, 'kistenWoerter'), true));
      // Je Person: auch bei ✍️ „Mein Name“ nachspuren (nur Namen aus einem Wort, die die Tafel schreiben kann)
      if (def.werIst && nameTaugt(w.wort)) {
        const schalter = document.createElement('label');
        schalter.className = 'name-schalter';
        schalter.innerHTML = `<input type="checkbox" ${w.name ? 'checked' : ''}> auch bei ✍️ „Mein Name“`;
        schalter.querySelector('input').addEventListener('change', (e) => kistenWortName(w, e.target.checked));
        liste.appendChild(schalter);
      }
    });
    if (alle.length < KISTE_MAX) {
      const neu = document.createElement('button');
      neu.className = 'text-btn klein';
      neu.textContent = `➕ Wort für „${def.name}“`;
      neu.addEventListener('click', () => kistenWortNeu(def));
      liste.appendChild(neu);
    }
    teil.appendChild(liste);
    box.appendChild(teil);
  });
  return box;
}

async function kistenWortName(w, an) {
  const profil = await aktivesProfil();
  if (!profil) return;
  profil.kistenWoerter = (profil.kistenWoerter || []).map((x) => (x.id === w.id ? { ...x, name: an } : x));
  await datenbank.profilSpeichern(profil);
  await medienLaden();
}

async function kistenWortNeu(def) {
  let wort = (prompt(`${def.eingabe} für „${def.name}“, z. B. ${def.beispielWort}:`) || '').trim().slice(0, 30);
  // Namen ohne Artikel („die Oma“ → „Oma“), sonst hieße die Frage „Was machst du gern mit die Oma?“
  if (def.werIst) wort = wort.replace(/^(der|die|das)\s+/i, '');
  if (!wort) return;
  const profil = await aktivesProfil();
  if (!profil) return;
  profil.kistenWoerter = [...(profil.kistenWoerter || []), { id: Date.now().toString(36), kiste: def.id, wort, ...(def.werIst ? { name: true } : {}) }];
  await datenbank.profilSpeichern(profil);
  await medienLaden();
  medienZeichnen();
}

function faengtAnMit(wort, b) {
  return b === 'ß' || wort.trim().toLowerCase().startsWith(b);
}

async function eigenesWortNeu(eintrag) {
  const wort = (prompt(`Neues Wort mit „${eintrag.b}“, z. B. ${eintrag.b === 'm' ? 'Mama' : eintrag.b === 'p' ? 'Papa' : 'ein Name'}:`) || '').trim().slice(0, 30);
  if (!wort) return;
  if (!faengtAnMit(wort, eintrag.b) && !confirm(`„${wort}“ fängt nicht mit „${eintrag.b}“ an. Trotzdem hinzufügen?`)) return;
  const profil = await aktivesProfil();
  if (!profil) return;
  profil.woerter = [...(profil.woerter || []), { id: Date.now().toString(36), b: eintrag.b, wort }];
  await datenbank.profilSpeichern(profil);
  await medienLaden();
  medienZeichnen();
}

async function eigenesWortLoeschen(w, feld = 'woerter') {
  if (!confirm(`„${w.wort}“ mit Foto und Aufnahme löschen?`)) return;
  const profil = await aktivesProfil();
  if (!profil) return;
  profil[feld] = (profil[feld] || []).filter((x) => x.id !== w.id);
  await datenbank.profilSpeichern(profil);
  await datenbank.medienEntfernen(profil.id, `w-${w.id}`, 'bild');
  await datenbank.medienEntfernen(profil.id, `w-${w.id}`, 'stimme');
  await medienLaden();
  medienZeichnen();
}

async function medienEntfernen(b, art) {
  await datenbank.medienEntfernen(zustand.profil, b, art);
  await medienLaden();
  medienZeichnen();
}

function lobZeichnen() {
  const box = $('#lob');
  if (zustand.profil === STANDARD.id) {
    box.innerHTML = '<p class="hinweis">Im Profil „Standard“ lobt Thorsten '
      + '(„Super!“, „Toll gemacht!“, …). Eigene Lob-Sätze gehen in einem eigenen Profil.</p>';
    return;
  }
  const eigene = LOB_PLAETZE.filter((k) => medien[k] && medien[k].stimme).length;
  box.innerHTML = '<p class="hinweis">Nehmen Sie bis zu 5 Lob-Sätze auf, z. B. „Toll gemacht!“ oder „Super, mein Schatz!“. '
    + (eigene
      ? `<b>Ihre ${eigene === 1 ? 'Aufnahme wird' : `${eigene} Aufnahmen werden`} abwechselnd gespielt</b>, Thorsten lobt nicht mehr.`
      : 'Solange keiner aufgenommen ist, lobt Thorsten.')
    + '</p>';
  LOB_PLAETZE.forEach((platz, i) => {
    const hat = medien[platz] && medien[platz].stimme;
    const zeile = document.createElement('div');
    zeile.className = 'lob-zeile';
    zeile.innerHTML = `<span class="w">Lob ${i + 1}<br><small>${hat ? '<b>eigene Aufnahme</b>' : `Thorsten: „${LOB_SAETZE[i]}“`}</small></span>`
      + '<button class="mini-btn" data-a="rec" aria-label="Aufnehmen">🎙️</button>'
      + '<button class="mini-btn" data-a="play" aria-label="Anhören">▶️</button>'
      + `<button class="mini-btn" data-a="weg" aria-label="Aufnahme entfernen" ${hat ? '' : 'disabled'}>↩️</button>`;
    zeile.querySelector('[data-a=rec]').addEventListener('click', (e) => medienAufnehmen(platz, e.currentTarget));
    zeile.querySelector('[data-a=play]').addEventListener('click', () => lobAnhoeren(platz));
    zeile.querySelector('[data-a=weg]').addEventListener('click', () => medienEntfernen(platz, 'stimme'));
    box.appendChild(zeile);
  });
}

// Foto aus Kamera/Galerie; das verkleinerte Foto geht an "fertig" (Buchstabenbild oder Kinderfoto)
let fotoFertig = null;
function fotoWaehlen(fertig) {
  fotoFertig = fertig;
  const input = $('#foto-input');
  input.value = '';
  input.click();
}

function buchstabenFotoWaehlen(b) {
  const profil = zustand.profil;
  fotoWaehlen(async (blob) => {
    await datenbank.medienSetzen(profil, b, 'bild', blob);
    await medienLaden();
    medienZeichnen();
  });
}

$('#foto-input').addEventListener('change', async (e) => {
  const datei = e.target.files && e.target.files[0];
  if (!datei || !fotoFertig) return;
  let blob;
  try {
    blob = await fotoVerkleinern(datei);
  } catch {
    alert('Das Foto konnte nicht geladen werden.');
    return;
  }
  await fotoFertig(blob);
});

// Quadratisch zuschneiden (Mitte) und auf 512 px verkleinern: spart Speicher, passt in jede Kachel
async function fotoVerkleinern(datei) {
  let bild;
  try {
    bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
  } catch {
    bild = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(datei);
    });
  }
  const kante = Math.min(bild.width, bild.height);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  c.getContext('2d').drawImage(bild, (bild.width - kante) / 2, (bild.height - kante) / 2, kante, kante, 0, 0, 512, 512);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject()), 'image/jpeg', 0.85));
}

let rekorder = null;

function stopAufnahme() {
  if (rekorder && rekorder.state === 'recording') rekorder.stop();
}

// Aufnahme für einen Laut/Lob-Satz im gerade bearbeiteten Profil
function medienAufnehmen(b, knopf) {
  const profil = zustand.profil;
  aufnehmen(knopf, async (blob) => {
    await datenbank.medienSetzen(profil, b, 'stimme', blob);
    await medienLaden();
    if ($('#eltern').classList.contains('active')) medienZeichnen();
  });
}

// Mikrofon-Aufnahme (höchstens 5 s); "fertig" bekommt die Aufnahme als Blob
// fuerKind: kein Text-Fenster bei Fehlern (Kinder können nicht lesen) – der Knopf wackelt nur
// Ist das Mikrofon schon erlaubt? (Eltern erlauben es einmal, z. B. im Studio.) Unbekannt = nein
async function mikrofonErlaubt() {
  try {
    const p = await navigator.permissions.query({ name: 'microphone' });
    return p.state === 'granted';
  } catch { return false; }
}

async function aufnehmen(knopf, fertig, hoechstens = 5000, fuerKind = false) {
  if (rekorder && rekorder.state === 'recording') { stopAufnahme(); return; }
  const fehler = (text) => {
    if (!fuerKind) { alert(text); return; }
    knopf.classList.remove('wackelt'); void knopf.offsetWidth; knopf.classList.add('wackelt');
  };
  if (!navigator.mediaDevices || !window.MediaRecorder) { fehler('Aufnehmen geht nur über https bzw. in der installierten App.'); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    fehler('Kein Zugriff auf das Mikrofon. Bitte im Browser erlauben: Schloss-Symbol neben der Adresse antippen → Mikrofon → Zulassen.');
    return;
  }
  wiedergabeStoppen();
  const teile = [];
  const r = new MediaRecorder(stream);
  rekorder = r;
  r.ondataavailable = (e) => { if (e.data.size) teile.push(e.data); };
  r.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    if (rekorder === r) rekorder = null;
    knopf.classList.remove('aktiv');
    knopf.textContent = '🎙️';
    if (teile.length) await fertig(new Blob(teile, { type: r.mimeType }));
  };
  r.start();
  knopf.classList.add('aktiv');
  knopf.textContent = '⏹️';
  // Sicherheitsstopp (Standard 5 Sekunden)
  setTimeout(() => { if (r.state === 'recording') r.stop(); }, hoechstens);
}

// ---------- Stimme einsprechen (Elternbereich): Laute, Wörter, Lob – jedes Stück einmal, alles bleibt auf dem Gerät ----------

const STUDIO_RATE = 22050;
const STUDIO_BEREICHE = { laute: 'Laute', woerter: 'Wörter', lob: 'Lob', ansagen: 'Ansagen', kisten: 'Kisten', reime: 'Reime', silben: 'Silben' };
const studio = { bereich: 'laute', pos: 0, aufnahme: null, stream: null, rekorder: null, startet: false, stoppTimer: null, lauf: 0 };
// lauf: zählt bei jedem Wechsel/Verlassen hoch – späte Ergebnisse (Mikrofon, Aufbereitung) gehören dann nicht mehr hierher
const studioAktuell = (lauf) => lauf === studio.lauf && $('#studio').classList.contains('active') && !document.hidden;

// Ein Stück, das eine Standard-Datei ersetzt: schluessel datei:<name>.wav, Standard audio/<name>.wav
const studioDatei = (datei, felder) => ({ schluessel: `datei:${datei}`, standard: `audio/${datei}`, art: 'satz', ...felder });

// Stücke je Bereich; "schluessel" ist der Medien-Schlüssel im Profil (datei:… = ersetzt die Standard-Datei)
function studioStuecke(bereich) {
  if (bereich === 'laute') {
    return BUCHSTABEN.map((e) => studioDatei(`${dateiName(e.b)}-laut.wav`, { b: e.b, art: 'laut',
      text: e.b === 'ß' ? 'ß' : `${grossVon(e.b)} ${e.b}`, bild: bildHtml(e),
      tipp: `Nur den Laut, wie in „${e.wort}“ – nicht den Buchstabennamen („mmm“ statt „Em“).` }));
  }
  if (bereich === 'woerter') {
    const tipp = 'Das Wort einmal deutlich sprechen – den Laut davor setzt die App selbst dazu.';
    return BUCHSTABEN.flatMap((e) => [
      studioDatei(`${dateiName(e.b)}-wort.wav`, { b: e.b, art: 'wort', text: e.wort, bild: bildHtml(e), tipp }),
      ...(e.mehr || []).map(([wort, bild], i) => studioDatei(`${dateiName(e.b)}-${i + 2}-wort.wav`, { b: e.b, art: 'wort', text: wort, bild, tipp })),
    ]);
  }
  if (bereich === 'lob') {
    return LOB_SAETZE.map((satz, i) => ({ schluessel: `lob-${i + 1}`, art: 'lob', text: satz, bild: '⭐',
      tipp: 'Echt freuen, nicht übertreiben. Sobald ein eigener Lob-Satz da ist, lobt die App nur noch mit Ihren Sätzen – am besten alle fünf aufnehmen.',
      standard: `audio/lob-${i + 1}.wav` }));
  }
  if (bereich === 'ansagen') {
    return Object.entries(ANSAGEN).map(([name, [satz, spiel]]) => studioDatei(`ansage-${name}.wav`, { text: satz, bild: '💬',
      tipp: `Ansage im Spiel „${spiel}“ – freundlich und ruhig, wie zu einem Kind neben Ihnen.` }));
  }
  if (bereich === 'kisten') {
    return [
      ...KISTEN.flatMap((k) => k.woerter.map(([id, wort, bild]) => studioDatei(`kiste-${id}.wav`, { text: wort, bild, foto: true,
        tipp: `Wörterkiste „${k.name}“ – das Wort MIT Artikel sprechen.` }))),
      ...Object.entries(TIERLAUTE).map(([id, laut]) => studioDatei(`tier-${id}.wav`, { text: laut,
        bild: KISTEN.flatMap((k) => k.woerter).find((w) => w[0] === id)[2], tipp: 'Tierlaut für „Wie macht …?“ – so, wie Sie ihn zu Hause machen.' })),
    ];
  }
  if (bereich === 'reime') {
    return REIME.flatMap((p) => p.woerter).filter((w) => w[3].startsWith('audio/reim-')).map(([, wort, bild, datei]) =>
      studioDatei(datei.replace('audio/', ''), { text: wort, bild, tipp: 'Wort für die Reim-Paare – ohne Artikel, deutlich sprechen.' }));
  }
  // Silben einzeln (am Handy verlässlicher als eine Aufnahme schneiden)
  const bildVon = (wort) => (BUCHSTABEN.find((e) => e.wort === wort) || {}).bild
    || (BUCHSTABEN.flatMap((e) => e.mehr || []).find((m) => m[0] === wort) || [])[1] || '🥁';
  return Object.entries(SILBEN).flatMap(([wort, teile]) => teile.map((silbe, i) => studioDatei(silbenDatei(wort, i + 1).replace('audio/', ''), {
    text: silbe, bild: bildVon(wort), tipp: `Silbe ${i + 1} von „${teile.join('-')}“ – kurz und deutlich, wie beim Klatschen.` })));
}

const studioEigen = (st) => !!(medien[st.schluessel] && medien[st.schluessel].stimme);

function studioZeichnen() {
  const stuecke = studioStuecke(studio.bereich);
  const st = stuecke[studio.pos];
  $('#studio-reiter').innerHTML = '';
  Object.entries(STUDIO_BEREICHE).forEach(([id, name]) => {
    const btn = document.createElement('button');
    btn.className = id === studio.bereich ? 'aktiv' : '';
    btn.textContent = `${name} ${studioStuecke(id).filter(studioEigen).length}/${studioStuecke(id).length}`;
    btn.addEventListener('click', () => { studioAbbrechen(); studio.bereich = id; studioErstesOffenes(); });
    $('#studio-reiter').appendChild(btn);
  });
  $('#studio-balken').style.width = `${(stuecke.filter(studioEigen).length / stuecke.length) * 100}%`;
  const foto = st.foto && medien[st.schluessel] && medien[st.schluessel].bildUrl;
  $('#studio-bild').innerHTML = foto ? `<img class="kiste-foto" src="${foto}" alt="">` : st.bild;
  $('#studio-foto').hidden = !st.foto;
  $('#btn-studio-foto-weg').hidden = !foto;
  $('#studio-text').textContent = st.text;
  $('#studio-text').classList.toggle('eigen', studioEigen(st));
  $('#studio-tipp').textContent = st.tipp;
  $('#btn-studio-meins').disabled = !studioEigen(st);
  $('#btn-studio-zuruecksetzen').hidden = !studioEigen(st);
  $('#btn-studio-gut').disabled = !studio.aufnahme;
  $('#btn-studio-vor').disabled = studio.pos === 0;
  $('#btn-studio-weiter').disabled = studio.pos === stuecke.length - 1;
  $('#btn-studio-alle-weg').hidden = !stuecke.some(studioEigen);
}

function studioMeldung(text, warnung = false) {
  const m = $('#studio-meldung');
  m.textContent = text;
  m.classList.toggle('warnung', warnung);
}

function studioGehe(pos) {
  studioAbbrechen();
  studio.pos = Math.max(0, Math.min(studioStuecke(studio.bereich).length - 1, pos));
  studioMeldung('Gedrückt halten und sprechen, dann loslassen.');
  studioZeichnen();
}

function studioErstesOffenes() {
  const i = studioStuecke(studio.bereich).findIndex((st) => !studioEigen(st));
  studioGehe(i >= 0 ? i : 0);
}

async function studioOeffnen() {
  if (zustand.profil === STANDARD.id) return;
  const profil = await aktivesProfil();
  $('#studio-titel').textContent = `Stimme: ${profil ? profil.name : ''}`;
  $('#studio-hinweis').hidden = speicher.lesen('studioHinweis', false);
  zeigen('studio');
  studioErstesOffenes();
}

// Mikrofon nur, solange das Studio offen ist; beim Verlassen oder im Hintergrund ganz schließen
function studioMikrofonZu() {
  clearTimeout(studio.stoppTimer);
  if (studio.rekorder && studio.rekorder.state === 'recording') { studio.rekorder.onstop = null; studio.rekorder.stop(); }
  studio.rekorder = null;
  if (studio.stream) studio.stream.getTracks().forEach((t) => t.stop());
  studio.stream = null;
  $('#btn-studio-mikro').classList.remove('aktiv');
}

function studioAbbrechen() {
  studio.lauf++;
  if (studio.rekorder) studioMikrofonZu();
  studio.aufnahme = null;
}

async function studioAufnahmeStart() {
  if (studio.rekorder || studio.startet) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) { studioMeldung('Aufnehmen geht nur in der installierten App bzw. über https.', true); return; }
  studio.startet = true;
  wiedergabeStoppen();
  const lauf = studio.lauf;
  try {
    const stream = studio.stream || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
    // Inzwischen verlassen (z. B. während der Berechtigungsfrage): Mikrofon sofort wieder schließen
    if (!studioAktuell(lauf)) { stream.getTracks().forEach((t) => t.stop()); studio.startet = false; return; }
    studio.stream = stream;
  } catch {
    studio.startet = false;
    studioMeldung('Kein Zugriff aufs Mikrofon. Bitte in den Einstellungen des Handys/Browsers das Mikrofon für diese App erlauben.', true);
    return;
  }
  studio.startet = false;
  if (!studio.gedrueckt) return;   // schon wieder losgelassen, während das Mikrofon aufging
  const teile = [];
  const r = new MediaRecorder(studio.stream);
  studio.rekorder = r;
  r.ondataavailable = (e) => { if (e.data.size) teile.push(e.data); };
  const st = studioStuecke(studio.bereich)[studio.pos];   // gehört zu diesem Stück, auch wenn danach weitergeblättert wird
  r.onstop = () => { studio.rekorder = null; $('#btn-studio-mikro').classList.remove('aktiv'); studioVerarbeiten(new Blob(teile, { type: r.mimeType }), st, lauf); };
  r.start();
  $('#btn-studio-mikro').classList.add('aktiv');
  studioMeldung('Ich höre zu …');
  studioPegelStarten(studio.stream, r);
  // Sicherheitsstopp: Laute/Wörter kurz, Lob etwas länger
  studio.stoppTimer = setTimeout(() => { if (r.state === 'recording') r.stop(); }, ['lob', 'ansagen'].includes(studio.bereich) ? 6000 : 4000);
}

function studioAufnahmeStopp() {
  studio.gedrueckt = false;
  clearTimeout(studio.stoppTimer);
  if (studio.rekorder && studio.rekorder.state === 'recording') studio.rekorder.stop();
}

// Pegel-Balken während der Aufnahme: zeigt, dass die App hört (und ob es zu leise ist)
function studioPegelStarten(stream, rekorder) {
  const ctx = audio();
  const balken = $('#studio-pegel');
  if (!ctx || !balken) return;
  let quelle;
  try { quelle = ctx.createMediaStreamSource(stream); } catch { return; }
  const analyse = ctx.createAnalyser();
  analyse.fftSize = 512;
  quelle.connect(analyse);
  const daten = new Uint8Array(analyse.fftSize);
  const schritt = () => {
    if (rekorder.state !== 'recording') { balken.style.width = '0'; quelle.disconnect(); return; }
    analyse.getByteTimeDomainData(daten);
    let spitze = 0;
    for (const x of daten) spitze = Math.max(spitze, Math.abs(x - 128));
    balken.style.width = `${Math.min(100, (spitze / 128) * 160)}%`;
    requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
}

// Auf 22050 Hz umrechnen, Stille abschneiden, Lautstärke angleichen (wie das Aufnahme-Studio am Laptop)
async function studioAufbereiten(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let puffer;
  try { puffer = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { ctx.close(); }
  const off = new OfflineAudioContext(1, Math.ceil(puffer.duration * STUDIO_RATE), STUDIO_RATE);
  const q = off.createBufferSource();
  q.buffer = puffer;
  q.connect(off.destination);
  q.start();
  const d = (await off.startRendering()).getChannelData(0);
  const fenster = Math.round(STUDIO_RATE * 0.01);
  const energie = [];
  for (let i = 0; i < d.length; i += fenster) {
    let summe = 0;
    for (let j = i; j < Math.min(d.length, i + fenster); j++) summe += d[j] * d[j];
    energie.push(Math.sqrt(summe / fenster));
  }
  const spitze = Math.max(0, ...energie);
  if (spitze < 0.01) return null;
  const schwelle = Math.max(0.006, spitze * 0.1);
  const erstes = energie.findIndex((e) => e >= schwelle);
  const letztes = energie.length - 1 - [...energie].reverse().findIndex((e) => e >= schwelle);
  if (letztes - erstes < 6) return null;   // nur ein Klick
  const t = d.slice(Math.max(0, erstes - 4) * fenster, Math.min(energie.length, letztes + 10) * fenster);
  const hoch = t.reduce((m, x) => Math.max(m, Math.abs(x)), 1e-6);
  const blende = Math.round(STUDIO_RATE * 0.008);
  return t.map((x, i) => x / hoch * 0.9 * Math.min(1, i / blende, (t.length - 1 - i) / blende));
}

function studioWav(...stuecke) {
  const laenge = stuecke.reduce((n, s) => n + s.length, 0);
  const buf = new ArrayBuffer(44 + laenge * 2);
  const v = new DataView(buf);
  const text = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + laenge * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, STUDIO_RATE, true); v.setUint32(28, STUDIO_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, laenge * 2, true);
  let o = 44;
  stuecke.forEach((s) => s.forEach((x) => { v.setInt16(o, Math.max(-1, Math.min(1, x)) * 32767, true); o += 2; }));
  return new Blob([buf], { type: 'audio/wav' });
}

async function studioVerarbeiten(blob, st = studioStuecke(studio.bereich)[studio.pos], lauf = studio.lauf) {
  let t = null;
  try { t = await studioAufbereiten(blob); } catch { t = null; }
  if (lauf !== studio.lauf || !$('#studio').classList.contains('active')) return;   // inzwischen weitergeblättert/verlassen
  if (!t) { studio.aufnahme = null; studioZeichnen(); studioMeldung('Nichts gehört – bitte etwas lauter nochmal.', true); return; }
  // Laut: einmal gesprochen, in der App "mmm … mmm"
  studio.aufnahme = st.art === 'laut' ? studioWav(t, new Float32Array(Math.round(STUDIO_RATE * 0.35)), t) : studioWav(t);
  studioZeichnen();
  studioMeldung('So klingt es im Spiel. Gut? Dann „Gut, weiter“ – sonst einfach nochmal halten.');
  studioVorschau(st);
}

// So, wie es im Spiel klingt (bei Wörtern mit dem Laut davor)
function studioVorschau(st) {
  const neu = studio.aufnahme ? blobQuelle(studio.aufnahme) : null;
  const eigenOder = (datei) => (eigeneDatei(datei) ? blobQuelle(eigeneDatei(datei)) : { url: datei });
  if (st.art === 'wort') folgeAbspielen([eigenOder(`audio/${dateiName(st.b)}-laut.wav`), neu || eigenOder(st.standard)]);
  else folgeAbspielen([neu || eigenOder(st.standard)]);
}

async function studioSpeichern() {
  if (!studio.aufnahme) return;
  const st = studioStuecke(studio.bereich)[studio.pos];
  speicherSchuetzen();
  const ok = await datenbank.medienSetzen(zustand.profil, st.schluessel, 'stimme', studio.aufnahme);
  if (!ok) { studioMeldung('Speichern ging nicht – vielleicht ist der Speicher voll. Bitte „Sichern & Übertragen“ nutzen und Altes löschen.', true); return; }
  (medien[st.schluessel] || (medien[st.schluessel] = {})).stimme = studio.aufnahme;
  studio.aufnahme = null;
  const naechstes = studioStuecke(studio.bereich).findIndex((x, i) => i > studio.pos && !studioEigen(x));
  studioGehe(naechstes >= 0 ? naechstes : studio.pos);
  studioMeldung(`„${st.text}“ gespeichert.`);
}

async function studioZuruecksetzen(alle) {
  const stuecke = alle ? studioStuecke(studio.bereich).filter(studioEigen) : [studioStuecke(studio.bereich)[studio.pos]];
  const frage = alle ? `${stuecke.length} eigene Aufnahme(n) bei „${STUDIO_BEREICHE[studio.bereich]}“ löschen? Dann gilt wieder die Standard-Stimme.`
    : `Ihre Aufnahme für „${stuecke[0].text}“ löschen? Dann gilt wieder die Standard-Stimme.`;
  if (!confirm(frage) || (alle && !confirm('Wirklich alle löschen?'))) return;
  for (const st of stuecke) {
    await datenbank.medienEntfernen(zustand.profil, st.schluessel, 'stimme');
    if (medien[st.schluessel]) delete medien[st.schluessel].stimme;
  }
  studioZeichnen();
}

const mikro = $('#btn-studio-mikro');
mikro.addEventListener('pointerdown', (e) => { e.preventDefault(); mikro.setPointerCapture(e.pointerId); studio.gedrueckt = true; studioAufnahmeStart(); });
['pointerup', 'pointercancel'].forEach((ev) => mikro.addEventListener(ev, studioAufnahmeStopp));
mikro.addEventListener('contextmenu', (e) => e.preventDefault());
$('#btn-studio-gut').addEventListener('click', studioSpeichern);
// Eigenes Foto für ein Kisten-Wort (gleicher Schlüssel wie die Aufnahme, Art „bild“)
$('#btn-studio-foto').addEventListener('click', () => {
  const st = studioStuecke(studio.bereich)[studio.pos];
  const profil = zustand.profil;
  fotoWaehlen(async (blob) => {
    if (!(await datenbank.medienSetzen(profil, st.schluessel, 'bild', blob))) { studioMeldung('Speichern ging nicht – vielleicht ist der Speicher voll.', true); return; }
    await medienLaden();
    studioZeichnen();
  });
});
$('#btn-studio-foto-weg').addEventListener('click', async () => {
  const st = studioStuecke(studio.bereich)[studio.pos];
  if (!confirm(`Ihr Foto für „${st.text}“ löschen? Dann gilt wieder das Bild aus „Standard“.`)) return;
  await datenbank.medienEntfernen(zustand.profil, st.schluessel, 'bild');
  await medienLaden();
  studioZeichnen();
});
$('#btn-studio-standard').addEventListener('click', () => { const st = studioStuecke(studio.bereich)[studio.pos]; folgeAbspielen([{ url: st.standard, standard: true }]); });
$('#btn-studio-meins').addEventListener('click', () => { const st = studioStuecke(studio.bereich)[studio.pos]; if (studioEigen(st)) folgeAbspielen([blobQuelle(medien[st.schluessel].stimme)]); });
$('#btn-studio-vor').addEventListener('click', () => studioGehe(studio.pos - 1));
$('#btn-studio-weiter').addEventListener('click', () => studioGehe(studio.pos + 1));
$('#btn-studio-zuruecksetzen').addEventListener('click', () => studioZuruecksetzen(false));
$('#btn-studio-alle-weg').addEventListener('click', () => studioZuruecksetzen(true));
$('#btn-studio-ok').addEventListener('click', () => { speicher.schreiben('studioHinweis', true); $('#studio-hinweis').hidden = true; });
$('#btn-studio-zurueck').addEventListener('click', () => { studioAbbrechen(); studioMikrofonZu(); history.back(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { studioAbbrechen(); studioMikrofonZu(); } });

// ---------- Memory: Groß und klein ----------

// Nur Buchstaben, deren große und kleine Form sich deutlich unterscheiden
const MEMORY_BUCHSTABEN = BUCHSTABEN.map((e) => e.b).filter((b) => !'coöswvxzß'.includes(b));
const MEMORY_PAARE = 4;
const memory = { karten: [], offen: [], gefunden: 0, gesperrt: false, timer: null };

function grossVon(b) { return b === 'ß' ? 'ẞ' : b.toUpperCase(); }

// Großes I und kleines l sind in der Druckschrift beide ein senkrechter Strich: nie zusammen in ein Spiel
const MEMORY_NICHT_ZUSAMMEN = [['i', 'l']];

function memoryNeu(paare = MEMORY_PAARE) {
  clearTimeout(memory.timer);
  const auswahl = [];
  const frei = freigeschaltet();
  const offen = MEMORY_BUCHSTABEN.filter((b) => frei.has(b));
  for (const b of mischen(offen.length >= paare + 1 ? offen : MEMORY_BUCHSTABEN)) {
    if (auswahl.length === paare) break;
    const konflikt = MEMORY_NICHT_ZUSAMMEN.some((gruppe) => gruppe.includes(b) && gruppe.some((x) => x !== b && auswahl.includes(x)));
    if (!konflikt) auswahl.push(b);
  }
  memory.karten = mischen(auswahl.flatMap((b) => [{ b, z: grossVon(b) }, { b, z: b }]))
    .map((k, i) => ({ ...k, i, paar: false }));
  memory.offen = [];
  memory.gefunden = 0;
  memory.gesperrt = false;
  memoryZeichnen();
}

function memoryZeichnen() {
  $('#memory-paare').innerHTML = Array.from({ length: memory.karten.length / 2 },
    (_, i) => `<span class="${i < memory.gefunden ? 'voll' : ''}"></span>`).join('');
  const box = $('#memory-karten');
  box.innerHTML = '';
  memory.karten.forEach((k) => {
    const btn = document.createElement('button');
    btn.className = `memory-karte${k.paar ? ' paar' : ''}${memory.offen.includes(k.i) ? ' offen' : ''}`;
    btn.setAttribute('aria-label', memory.offen.includes(k.i) || k.paar ? k.z : 'verdeckte Karte');
    btn.innerHTML = `<div class="innen"><div class="hinten">★</div><div class="vorne">${strichSvg(k.z, [-26, 148], 70)}</div></div>`;
    btn.addEventListener('click', () => memoryKarteGetippt(k.i));
    box.appendChild(btn);
  });
}

function memoryKarteGetippt(i) {
  const k = memory.karten[i];
  if (memory.gesperrt || k.paar || memory.offen.includes(i)) return;
  audio();
  memory.offen.push(i);
  memoryZeichnen();
  if (memory.offen.length < 2) return;
  const [a, b] = memory.offen.map((j) => memory.karten[j]);
  if (a.b === b.b) {
    // Paar gefunden: bleibt offen, Laut ertönt
    a.paar = b.paar = true;
    memory.offen = [];
    memory.gefunden++;
    glockenspiel();
    folgeAbspielen([{ url: `audio/${dateiName(a.b)}-laut.wav` }]);
    memoryZeichnen();
    if (memory.gefunden === memory.karten.length / 2) memoryGeschafft();
  } else {
    // Kein Paar: kurz anschauen lassen, dann wieder umdrehen
    memory.gesperrt = true;
    memory.timer = setTimeout(memoryZurueckdrehen, 1300);
  }
}

function memoryZurueckdrehen() {
  memory.offen = [];
  memory.gesperrt = false;
  memoryZeichnen();
}

function memoryGeschafft() {
  const jubel = $('#memory-jubel');
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  memory.timer = setTimeout(() => {
    folgeAbspielen([{ url: 'audio/ansage-runde-geschafft.wav' }], 'Alles geschafft!');
  }, 700);
  memory.timerNeu = setTimeout(() => spielEnde('memory', memoryNeu), 2200);
}

function memoryStarten() {
  clearTimeout(memory.timerNeu);
  spielEndeWeg('memory');
  memoryNeu();
  zeigen('memory');
  folgeAbspielen([{ url: 'audio/ansage-memory.wav' }], 'Finde groß und klein!');
}

$('#btn-memory-home').addEventListener('click', () => {
  clearTimeout(memory.timer); clearTimeout(memory.timerNeu); wiedergabeStoppen(); zurStartseite();
});
$('#btn-memory-neu').addEventListener('click', () => { clearTimeout(memory.timerNeu); spielEndeWeg('memory'); memoryNeu(); });

// ---------- Buchstaben-Jagd: etwas mit dem Anlaut suchen und fotografieren ----------

// Buchstaben, für die man zu Hause gut etwas findet
const JAGD_BUCHSTABEN = BUCHSTABEN.map((e) => e.b).filter((b) => !'cqvxyäöüß'.includes(b));
const jagd = { b: null, foto: null, stimme: null, timer: null, gefunden: 0 };
let fundUrls = [];

const fundBesitzer = () => (aktivesKind() ? aktivesKind().id : 'ohne');

// Fotos/Aufnahmen der Funde: { fundId: { bildUrl, stimme } }
async function fundMedienLaden() {
  fundUrls.forEach((u) => URL.revokeObjectURL(u));
  fundUrls = [];
  const ergebnis = {};
  for (const { schluessel, blob } of await datenbank.medienVon(`fund-${fundBesitzer()}`)) {
    const [, id, art] = schluessel.split('|');
    const m = ergebnis[id] || (ergebnis[id] = {});
    if (art === 'bild') { m.bildUrl = URL.createObjectURL(blob); fundUrls.push(m.bildUrl); } else m.stimme = blob;
  }
  return ergebnis;
}

async function fundeUmziehen(von, nach) {
  for (const { schluessel, blob } of await datenbank.medienVon(`fund-${von}`)) {
    await datenbank.medienRoh(schluessel.replace(`fund-${von}|`, `fund-${nach}|`), blob);
  }
  await datenbank.profilLoeschen(`fund-${von}`);
}

function jagdNeuerBuchstabe() {
  clearTimeout(jagd.timer);
  const frei = freigeschaltet();
  const moeglich = JAGD_BUCHSTABEN.filter((b) => frei.has(b) && b !== jagd.b);
  jagd.b = zufall(moeglich.length ? moeglich : JAGD_BUCHSTABEN.filter((b) => b !== jagd.b));
  jagd.foto = null;
  jagd.stimme = null;
  const e = BUCHSTABEN.find((x) => x.b === jagd.b);
  $('#jagd-buchstabe').innerHTML = strichSvg(zeichen(e), [-26, 148], 70);
  $('#jagd-buchstabe').hidden = false;
  $('#jagd-foto').hidden = true;
  $('#btn-jagd-stimme').hidden = true;
  $('#btn-jagd-fertig').hidden = true;
  jagdAnsage();
}

function jagdAnsage() {
  folgeAbspielen([{ url: 'audio/ansage-jagd.wav' }, { url: `audio/${dateiName(jagd.b)}-laut.wav` }], 'Finde etwas, das so anfängt!');
}

function jagdFotoGesetzt(blob) {
  jagd.foto = blob;
  const url = URL.createObjectURL(blob);
  fundUrls.push(url);
  $('#jagd-foto').innerHTML = `<img src="${url}" alt="">`;
  $('#jagd-foto').hidden = false;
  $('#jagd-buchstabe').hidden = true;
  $('#btn-jagd-stimme').hidden = false;
  $('#btn-jagd-fertig').hidden = false;
}

function jagdStimmeGesetzt(blob) {
  jagd.stimme = blob;
  folgeAbspielen([{ url: `audio/${dateiName(jagd.b)}-laut.wav` }, blobQuelle(blob)]);
}

async function jagdSpeichern() {
  if (!jagd.foto) return;
  const id = Date.now().toString(36);
  const besitzer = `fund-${fundBesitzer()}`;
  await datenbank.medienSetzen(besitzer, id, 'bild', jagd.foto);
  speicherSchuetzen();
  if (jagd.stimme) await datenbank.medienSetzen(besitzer, id, 'stimme', jagd.stimme);
  zustand.funde = [...(zustand.funde || []), { id, b: jagd.b, zeit: Date.now() }];
  await einstellungenSpeichern();
  // Jubel mit dem Foto, Lob, Laut und (falls aufgenommen) dem Wort
  const jubel = $('#jagd-jubel');
  $('#jagd-jubel-bild').innerHTML = $('#jagd-foto').innerHTML;
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  glockenspiel();
  folgeAbspielen([...lobMitName(jagd.b), { url: `audio/${dateiName(jagd.b)}-laut.wav` }, ...(jagd.stimme ? [blobQuelle(jagd.stimme)] : [])], 'Super!');
  jagd.gefunden++;
  jagd.timer = setTimeout(() => {
    if (jagd.gefunden >= JAGD_ENDE_NACH) {
      $('#jagd-jubel-bild').textContent = '🏆';
      spielEnde('jagd', () => { jagd.gefunden = 0; spielEndeWeg('jagd'); jagdNeuerBuchstabe(); });
      return;
    }
    jubel.classList.remove('zeigen');
    jagdNeuerBuchstabe();
  }, 3600);
}

const JAGD_ENDE_NACH = 3;   // Funde je Besuch – das Herumlaufen ist wertvoll, braucht aber auch einen Schluss

function jagdStarten() {
  jagd.gefunden = 0;
  spielEndeWeg('jagd');
  zeigen('jagd');
  jagdNeuerBuchstabe();
}

$('#btn-jagd-home').addEventListener('click', () => { clearTimeout(jagd.timer); stopAufnahme(); wiedergabeStoppen(); zurStartseite(); });
$('#btn-jagd-laut').addEventListener('click', () => { audio(); jagdAnsage(); });
$('#btn-jagd-neu').addEventListener('click', () => { $('#jagd-jubel').classList.remove('zeigen'); jagdNeuerBuchstabe(); });
$('#btn-jagd-foto').addEventListener('click', () => { const i = $('#jagd-input'); i.value = ''; i.click(); });
$('#jagd-input').addEventListener('change', async (e) => {
  const datei = e.target.files && e.target.files[0];
  if (!datei) return;
  try { jagdFotoGesetzt(await fotoVerkleinern(datei)); } catch { alert('Das Foto konnte nicht geladen werden.'); }
});
$('#btn-jagd-stimme').addEventListener('click', (e) => aufnehmen(e.currentTarget, async (blob) => jagdStimmeGesetzt(blob), 5000, true));
$('#btn-jagd-fertig').addEventListener('click', jagdSpeichern);

// ---------- Wörter legen (bewegliches Alphabet) ----------

// Nur lautgetreue Wörter: so geschrieben, wie man sie hört (kein sch/ch/ei/au, kein stummes h)
const LEGEN_NICHT = ['Uhr', 'Ohr', 'Kuh', 'Ähre', 'Fuß'];
const LEGEN_RUNDEN = 3;
const legen = { wahl: null, buchstaben: [], pos: 0, runde: 0, steine: [], timer: null, vorher: [], fehlversuche: 0 };

function lautgetreu(wort) {
  const w = wort.toLowerCase();
  return /^[a-zäöüß]+$/.test(w) && !['sch', 'ch', 'ei', 'eu', 'ie', 'au', 'äu', 'ck', 'qu'].some((x) => w.includes(x))
    && ![...w].some((c) => 'cvxyß'.includes(c));
}

function legenWoerter() {
  return BUCHSTABEN.flatMap((e) => woerterFuer(e)).filter((w) => {
    // auch persönliche Wörter nur lautgetreu („Mama“, „Lina“ ja; „Theo“, „Sophie“ nein)
    if (w.art === 'eigen') return w.wort.length >= 2 && w.wort.length <= 6 && lautgetreu(w.wort) && w.wortAllein().length;
    return w.wort.length >= 3 && w.wort.length <= 4 && lautgetreu(w.wort) && !LEGEN_NICHT.includes(w.wort);
  });
}

// So, wie das Kind schreibt: GROSS oder klein (Montessori: klein)
const legenZeichen = (b) => (zustand.schreibweise === 'gross' ? grossVon(b) : b);

function legenNeuesWort() {
  clearTimeout(legen.timer);
  const auswahl = legenWoerter().filter((w) => !legen.vorher.includes(w.wort));
  legen.wahl = zufall(auswahl.length ? auswahl : legenWoerter());
  legen.vorher = [...legen.vorher.slice(-4), legen.wahl.wort];
  legen.buchstaben = [...legen.wahl.wort.toLowerCase()];
  legen.pos = 0;
  legen.fehlversuche = 0;
  // Steine: alle Buchstaben des Wortes + 2 andere
  const andere = mischen(BUCHSTABEN.map((e) => e.b).filter((b) => !legen.buchstaben.includes(b) && !'cqvxyß'.includes(b))).slice(0, 2);
  legen.steine = mischen([...legen.buchstaben, ...andere]).map((b, i) => ({ b, i, weg: false }));
  legenZeichnen();
  folgeAbspielen([{ url: 'audio/ansage-legen.wav' }, ...legen.wahl.wortAllein()], 'Leg das Wort!');
}

function legenZeichnen() {
  $('#legen-runden').innerHTML = Array.from({ length: LEGEN_RUNDEN }, (_, i) => `<span class="${i < legen.runde ? 'voll' : ''}"></span>`).join('');
  $('#legen-bild').innerHTML = legen.wahl.bild();
  const felder = $('#legen-felder');
  felder.innerHTML = '';
  legen.buchstaben.forEach((b, i) => {
    const feld = document.createElement('button');
    feld.className = `legen-feld${i < legen.pos ? ' voll' : ''}${i === legen.pos ? ' naechstes' : ''}`;
    feld.innerHTML = i < legen.pos ? strichSvg(legenZeichen(b), [-26, 148], 40) : '';
    feld.setAttribute('aria-label', i < legen.pos ? b : 'leeres Feld');
    // Tipp aufs nächste leere Feld: den gesuchten Laut hören
    if (i === legen.pos) feld.addEventListener('click', () => folgeAbspielen([{ url: `audio/${dateiName(b)}-laut.wav` }]));
    felder.appendChild(feld);
  });
  const steine = $('#legen-steine');
  steine.innerHTML = '';
  legen.steine.forEach((st) => {
    const btn = document.createElement('button');
    btn.className = `legen-stein${st.weg ? ' weg' : ''}`;
    btn.innerHTML = strichSvg(legenZeichen(st.b), [-26, 148], 40);
    btn.setAttribute('aria-label', st.b);
    btn.addEventListener('click', () => legenSteinGetippt(st, btn));
    steine.appendChild(btn);
  });
}

function legenSteinGetippt(st, btn) {
  if (st.weg || legen.pos >= legen.buchstaben.length) return;
  audio();
  if (st.b !== legen.buchstaben[legen.pos]) {
    btn.classList.remove('falsch');
    void btn.offsetWidth;
    btn.classList.add('falsch');
    folgeAbspielen([{ url: `audio/${dateiName(st.b)}-laut.wav` }]);
    // Nach zwei Fehlversuchen: der passende Stein pulsiert sanft (Hinweis, kein „falsch“)
    if (++legen.fehlversuche >= 2) {
      const i = legen.steine.findIndex((x) => !x.weg && x.b === legen.buchstaben[legen.pos]);
      const richtig = document.querySelectorAll('.legen-stein')[i];
      if (richtig) richtig.classList.add('hinweis');
    }
    return;
  }
  legen.fehlversuche = 0;
  st.weg = true;
  legen.pos++;
  if (legen.pos < legen.buchstaben.length) {
    folgeAbspielen([{ url: `audio/${dateiName(st.b)}-laut.wav` }]);
    legenZeichnen();
    return;
  }
  // Wort fertig
  legen.runde++;
  legenZeichnen();
  glockenspiel();
  folgeAbspielen([...lobMitName(legen.wahl.b), ...legen.wahl.wortAllein()], `Super! ${legen.wahl.wort}`);
  legen.timer = setTimeout(() => (legen.runde >= LEGEN_RUNDEN ? legenGeschafft() : legenNeuesWort()), 2600);
}

function legenGeschafft() {
  const jubel = $('#legen-jubel');
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  glockenspiel();
  folgeAbspielen([{ url: 'audio/ansage-runde-geschafft.wav' }], 'Alles geschafft!');
  legen.timer = setTimeout(() => spielEnde('legen', () => { legen.runde = 0; legenNeuesWort(); }), 2200);
}

function legenStarten() {
  legen.runde = 0;
  spielEndeWeg('legen');
  zeigen('legen');
  legenNeuesWort();
}

$('#btn-legen-home').addEventListener('click', () => { clearTimeout(legen.timer); wiedergabeStoppen(); zurStartseite(); });
$('#btn-legen-wort').addEventListener('click', () => { audio(); folgeAbspielen(legen.wahl.wortAllein()); });
$('#legen-bild').addEventListener('click', () => { audio(); folgeAbspielen(legen.wahl.wortAllein()); });

// ---------- Sticker-Album ----------

const stickerSchluessel = (b, wort) => `${b}|${wort}`;

// Gibt true zurück, wenn der Sticker neu ist
function stickerVergeben(eintrag, wahl) {
  const key = stickerSchluessel(eintrag.b, wahl.wort);
  if (!zustand.album) zustand.album = [];
  if (zustand.album.includes(key)) return false;
  zustand.album.push(key);
  einstellungenSpeichern();
  return true;
}

function alleSticker() {
  return BUCHSTABEN.flatMap((e) => woerterFuer(e).map((w) => ({ e, w, key: stickerSchluessel(e.b, w.wort) })));
}

function albumZeichnen(fundMedien = {}) {
  // Erinnerungsbuch statt Sammelpflicht: nur, was das Kind gespurt, gefunden und erzählt hat – kein Zähler, keine „?“
  const gesammelt = new Set(zustand.album || []);
  const alle = alleSticker().filter((s) => gesammelt.has(s.key));
  $('#album-zahl').textContent = '';
  const raster = $('#album-raster');
  raster.innerHTML = '';
  // Oben: Fotos aus der Buchstaben-Jagd
  const funde = (zustand.funde || []).filter((f) => fundMedien[f.id] && fundMedien[f.id].bildUrl);
  if (funde.length) {
    raster.insertAdjacentHTML('beforeend', '<div class="album-abschnitt">🔍</div>');
    // Eigene Reihe mit fester Kachelgröße (im Raster würde die Zeilenhöhe der Fotos falsch berechnet)
    const reihe = document.createElement('div');
    reihe.className = 'album-funde';
    raster.appendChild(reihe);
    funde.slice().reverse().forEach((f) => {
      const m = fundMedien[f.id];
      const e = BUCHSTABEN.find((x) => x.b === f.b) || BUCHSTABEN[0];
      const el = document.createElement('button');
      el.className = 'sticker hat fund';
      el.innerHTML = `<img src="${m.bildUrl}" alt=""><small>${zeichen(e)}</small>`;
      el.addEventListener('click', () => folgeAbspielen([{ url: `audio/${dateiName(f.b)}-laut.wav` }, ...(m.stimme ? [blobQuelle(m.stimme)] : [])]));
      reihe.appendChild(el);
    });
    raster.insertAdjacentHTML('beforeend', '<div class="album-abschnitt">📒</div>');
  }
  // Erzählungen aus der Wörterkiste: die drei Bilder der Runde, Tipp = die Aufnahme des Kindes
  const erzaehlungen = (zustand.funde || []).filter((f) => f.art === 'erzaehlung' && fundMedien[f.id] && fundMedien[f.id].stimme);
  if (erzaehlungen.length) {
    raster.insertAdjacentHTML('afterbegin', '<div class="album-abschnitt">💬</div>');
    const reihe = document.createElement('div');
    reihe.className = 'album-funde';
    raster.children[0].after(reihe);
    erzaehlungen.slice().reverse().forEach((f) => {
      const k = alleKisten().find((x) => x.id === f.kiste);
      // Gelöschte Wörter (eigene Kisten) zeigen das Kisten-Symbol
      const bilder = k ? f.woerter.map((id) => kisteBildHtml(id, (k.woerter.find((w) => w[0] === id) || [, , k.bild])[2])).join('') : '💬';
      const el = document.createElement('button');
      el.className = 'sticker hat erzaehlung';
      el.innerHTML = `<span>${bilder}</span><small>💬</small>`;
      el.setAttribute('aria-label', 'Erzählung anhören');
      el.addEventListener('click', () => folgeAbspielen([blobQuelle(fundMedien[f.id].stimme)]));
      reihe.appendChild(el);
    });
    if (!funde.length) raster.insertAdjacentHTML('beforeend', '<div class="album-abschnitt">📒</div>');
  }
  alle.forEach(({ e, w, key }) => {
    const hat = gesammelt.has(key);
    const el = document.createElement('button');
    el.className = `sticker${hat ? ' hat' : ''}`;
    el.innerHTML = `${hat ? w.bild() : '?'}<small>${zeichen(e)}</small>`;
    el.setAttribute('aria-label', hat ? w.wort : 'noch nicht gesammelt');
    // Gesammelte Sticker sprechen ihr Wort ("mmm … mmm … Maus"), fehlende den Laut als Tipp
    el.addEventListener('click', () => folgeAbspielen(hat ? w.ansage() : [{ url: `audio/${dateiName(e.b)}-laut.wav` }]));
    raster.appendChild(el);
  });
  // Noch leer: ein Stift, der zum Nachspuren führt (dort gibt es die ersten Sticker)
  if (!raster.children.length) {
    const leer = document.createElement('button');
    leer.className = 'album-leer';
    leer.textContent = '✏️';
    leer.setAttribute('aria-label', 'Zum Nachspuren');
    leer.addEventListener('click', () => { audio(); buchstabenZeigen(); });
    raster.appendChild(leer);
  }
}

async function albumOeffnen() {
  albumZeichnen(await fundMedienLaden());
  zeigen('album');
}

$('#btn-album-home').addEventListener('click', () => { wiedergabeStoppen(); zurStartseite(); });

// ---------- Spiel: Ich höre was (Anlaute hören) ----------

const HOER_RUNDEN = 5;
// Laute, die am Wortanfang gleich oder sehr ähnlich klingen, kommen nie zusammen in eine Runde
const LAUT_GRUPPE = { v: 'f', c: 'k', q: 'k', x: 'k', 'ä': 'e', y: 'j' };
const lautGruppe = (b) => LAUT_GRUPPE[b] || b;
const hoerSpiel = { runde: 0, ziel: null, gesperrt: false, timer: null };

function mischen(liste) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ziel + 2 Bilder mit anderem Anlaut; ß hat keinen Anlaut und bleibt draußen
function hoerRundeWaehlen(vorher = null) {
  const kandidaten = BUCHSTABEN.filter((e) => e.b !== 'ß');
  // Montessori: gesucht werden nur schon freigeschaltete Laute (die anderen Bilder dürfen beliebig sein)
  const frei = freigeschaltet();
  const zielKandidaten = kandidaten.filter((e) => frei.has(e.b) && e !== vorher);
  const ziel = zufall(zielKandidaten.length ? zielKandidaten : kandidaten.filter((e) => e !== vorher));
  const andere = [];
  for (const e of mischen(kandidaten)) {
    if (andere.length === 2) break;
    const gruppen = [ziel, ...andere].map((x) => lautGruppe(x.b));
    if (!gruppen.includes(lautGruppe(e.b))) andere.push(e);
  }
  return { ziel, karten: mischen([ziel, ...andere]) };
}

function hoerLautAbspielen(mitFrage = true) {
  const datei = dateiName(hoerSpiel.ziel.b);
  const folge = mitFrage ? [{ url: 'audio/ansage-hoeren.wav' }] : [];
  folge.push({ url: `audio/${datei}-laut.wav` });
  return folgeAbspielen(folge, `${hoerSpiel.ziel.laut} … ${hoerSpiel.ziel.laut}`);
}

function hoerRundenAnzeigen() {
  $('#hoeren-runden').innerHTML = Array.from({ length: HOER_RUNDEN },
    (_, i) => `<span class="${i < hoerSpiel.runde ? 'voll' : ''}"></span>`).join('');
}

function hoerNeueRunde() {
  const { ziel, karten } = hoerRundeWaehlen(hoerSpiel.ziel);
  hoerSpiel.ziel = ziel;
  hoerSpiel.gesperrt = false;
  hoerRundenAnzeigen();
  const box = $('#hoeren-karten');
  box.innerHTML = '';
  karten.forEach((e) => {
    // Pro Buchstabe ein zufälliges Wort aus dem Vorrat (auch persönliche Wörter)
    const wahl = wortWaehlen(e);
    if (e === ziel) hoerSpiel.zielWahl = wahl;
    const btn = document.createElement('button');
    btn.className = 'hoer-karte';
    btn.innerHTML = wahl.bild();
    btn.setAttribute('aria-label', wahl.wort);
    btn.addEventListener('click', () => hoerKarteGewaehlt(e, btn, wahl));
    box.appendChild(btn);
  });
  hoerLautAbspielen();
}

function hoerKarteGewaehlt(e, btn, wahl) {
  if (hoerSpiel.gesperrt || btn.classList.contains('falsch')) return;
  audio();
  if (e === hoerSpiel.ziel) {
    hoerSpiel.gesperrt = true;
    btn.classList.add('richtig');
    glockenspiel();
    hoerSpiel.runde++;
    hoerRundenAnzeigen();
    folgeAbspielen(wahl.wortAllein(), wahl.wort);
    clearTimeout(hoerSpiel.timer);
    hoerSpiel.timer = setTimeout(() => (hoerSpiel.runde >= HOER_RUNDEN ? hoerGeschafft() : hoerNeueRunde()), 1900);
  } else {
    // Kein "falsch": Bild wackelt, sein Wort erklingt, dann der gesuchte Laut noch einmal
    btn.classList.add('falsch');
    folgeAbspielen([...wahl.wortAllein(), { url: 'audio/ansage-hoeren-nochmal.wav' },
      { url: `audio/${dateiName(hoerSpiel.ziel.b)}-laut.wav` }], wahl.wort);
  }
}

function hoerGeschafft() {
  const jubel = $('#hoeren-jubel');
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  glockenspiel();
  folgeAbspielen([{ url: 'audio/ansage-runde-geschafft.wav' }], 'Alles geschafft! Toll gemacht!');
  hoerSpiel.timer = setTimeout(() => spielEnde('hoeren', () => {
    hoerSpiel.runde = 0;
    hoerSpiel.ziel = null;
    hoerNeueRunde();
  }), 2200);
}

function hoerSpielStarten() {
  clearTimeout(hoerSpiel.timer);
  spielEndeWeg('hoeren');
  hoerSpiel.runde = 0;
  hoerSpiel.ziel = null;
  zeigen('hoeren');
  hoerNeueRunde();
}

$('#btn-hoeren-home').addEventListener('click', () => { clearTimeout(hoerSpiel.timer); wiedergabeStoppen(); zurStartseite(); });
$('#btn-hoeren-laut').addEventListener('click', () => { audio(); hoerLautAbspielen(false); });

// ---------- Zeig mir das mmm: Drei-Stufen-Lektion (Das ist … / Zeig mir … / Was ist das?) ----------

// Nicht zusammen in eine Lektion: sehen sich ähnlich (klein oder GROSS; lieber zu streng) …
const AEHNLICHE_FORMEN = [['b', 'd', 'p', 'q'], ['m', 'n', 'u', 'w'], ['i', 'j', 'l', 't'], ['a', 'o', 'ä', 'ö'],
  ['a', 'd', 'g', 'q'], ['o', 'q', 'c', 'g', 'd'], ['u', 'ü', 'v'], ['f', 't', 'e'], ['v', 'w', 'y', 'a'], ['c', 'e'],
  ['h', 'n', 'r'], ['n', 'z'], ['s', 'z', 'ß'], ['p', 'r', 'b'], ['k', 'x']];
// … oder klingen für Kinderohren fast gleich (gleiche Laute fasst lautGruppe zusammen)
const AEHNLICHE_LAUTE = [['m', 'n'], ['b', 'p'], ['d', 't'], ['g', 'k'], ['f', 'w', 'v'], ['s', 'z', 'ß']];
const ZEIGEN_STUFEN = [3, 6, 3];   // Schritte je Stufe (= Rundenpunkte in drei Gruppen)
const ZEIGEN_SYMBOL = ['👀', '👂', '🗣️'];
const lektion = { buchstaben: [], stufe: 0, schritt: 0, punkte: 0, daneben: new Set(), auftraege: [], ziel: null, gesperrt: true, timer: null, nummer: 0, letzterTipp: 0 };

const zeigenAktuell = (nr) => nr === lektion.nummer && $('#zeigen').classList.contains('active');

function vertraeglich(a, b) {
  return lautGruppe(a) !== lautGruppe(b)
    && ![...AEHNLICHE_FORMEN, ...AEHNLICHE_LAUTE].some((g) => g.includes(a) && g.includes(b));
}

// 3 Buchstaben: im Montessori-Modus aus der aktuellen Gruppe (wenigste Sterne zuerst), sonst aus den freien
function zeigenAuswahl() {
  const frei = [...freigeschaltet()];
  const zuerst = montessori() ? montessoriStand().aktuell : [];
  const nachSternen = (liste) => mischen(liste).sort((a, b) => (zustand.sterne[a] || 0) - (zustand.sterne[b] || 0));
  const wahl = [];
  [...nachSternen(zuerst), ...nachSternen(frei.filter((b) => !zuerst.includes(b)))].forEach((b) => {
    if (wahl.length < 3 && !wahl.includes(b) && wahl.every((x) => vertraeglich(x, b))) wahl.push(b);
  });
  return wahl;
}

// Reihenfolge der Aufträge in Stufe 2: jeder Buchstabe zweimal, nie zweimal derselbe hintereinander
function zeigenAuftraege(buchstaben) {
  if (new Set(buchstaben).size < 2) return [...buchstaben, ...buchstaben];
  for (;;) {
    const folge = mischen([...buchstaben, ...buchstaben]);
    if (folge.every((b, i) => b !== folge[i - 1])) return folge;
  }
}

const lautQuelle = (b) => ({ url: `audio/${dateiName(b)}-laut.wav` });
const lautText = (b) => (BUCHSTABEN.find((e) => e.b === b) || { laut: b }).laut;

function zeigenStoppen() {
  clearTimeout(lektion.timer);
  lektion.nummer++;
  lektion.gesperrt = true;
  lektion.wechsel = false;
}

function zeigenPunkteZeichnen() {
  let n = 0;
  $('#zeigen-runden').innerHTML = ZEIGEN_STUFEN.map((anzahl, stufe) => `<span class="punkt-gruppe${stufe === lektion.stufe ? ' jetzt' : ''}">${
    Array.from({ length: anzahl }, () => `<span class="${n++ < lektion.punkte ? 'voll' : ''}"></span>`).join('')}</span>`).join('');
}

function zeigenKarte(b, extra = '') {
  const btn = document.createElement('button');
  btn.className = `zeigen-karte${extra}`;
  btn.innerHTML = strichSvg(legenZeichen(b), [-26, 148], 40);
  btn.setAttribute('aria-label', b);
  btn.addEventListener('click', () => zeigenGetippt(b, btn));
  return btn;
}

function karteAnimieren(btn, klasse) {
  btn.classList.remove('huepft', 'wackelt');
  void btn.offsetWidth;
  btn.classList.add(klasse);
}

async function zeigenSagen(nr, folge, text) {
  await folgeAbspielen(folge, text);
  return zeigenAktuell(nr);
}

function zeigenSymbol() {
  const s = $('#zeigen-symbol');
  s.textContent = ZEIGEN_SYMBOL[lektion.stufe];
  karteAnimieren(s, 'huepft');
}

// Stufe 1: Das ist … (ein Buchstabe groß; Tipp = Laut nochmal, dann in die Ablage)
async function zeigenStufe1() {
  zeigenStoppen();
  const nr = lektion.nummer;
  const b = lektion.buchstaben[lektion.schritt];
  const box = $('#zeigen-karten');
  box.className = 'zeigen-karten einzeln';
  box.innerHTML = '';
  box.appendChild(zeigenKarte(b, ' kommt'));
  if (!(await zeigenSagen(nr, [{ url: 'audio/ansage-zeigen-das-ist.wav' }, lautQuelle(b)], `Das ist ${lautText(b)}`))) return;
  lektion.gesperrt = false;
  box.firstChild.classList.add('pulsiert');
  // Kein Tipp: einmal erinnern, dann zeigt die App selbst weiter (hier zeigt ja die App)
  lektion.timer = setTimeout(async () => {
    if (!zeigenAktuell(nr)) return;
    await zeigenSagen(nr, [lautQuelle(b)], lautText(b));
    lektion.timer = setTimeout(() => zeigenAktuell(nr) && zeigenWeiter(nr), 8000);
  }, 6000);
}

// Stufe 2: Zeig mir … (drei Karten, Plätze bleiben fest)
async function zeigenAuftrag() {
  zeigenStoppen();
  const nr = lektion.nummer;
  lektion.ziel = lektion.auftraege[lektion.schritt];
  document.querySelectorAll('.zeigen-karte').forEach((k) => k.classList.remove('blass', 'richtig'));
  // Nach der Hälfte die Plätze einmal tauschen: das Kind soll die Form suchen, nicht die Stelle
  if (lektion.schritt === 3) {
    const box = $('#zeigen-karten');
    const alt = [...box.children];
    let neu = mischen(alt);
    while (neu.every((k, i) => k === alt[i])) neu = mischen(alt);
    neu.forEach((k) => { k.classList.remove('kommt'); void k.offsetWidth; k.classList.add('kommt'); box.appendChild(k); });
    await warten(500);
    if (!zeigenAktuell(nr)) return;
  }
  if (!(await zeigenSagen(nr, [{ url: 'audio/ansage-zeigen-zeig-mir.wav' }, lautQuelle(lektion.ziel)], `Zeig mir ${lautText(lektion.ziel)}`))) return;
  lektion.gesperrt = false;
  zeigenWiederholen(nr, 2);
}

// 8 s nichts getippt: Auftrag wiederholen (höchstens zweimal), nie selbst weiterschalten
function zeigenWiederholen(nr, rest) {
  clearTimeout(lektion.timer);
  if (!rest) return;
  lektion.timer = setTimeout(async () => {
    if (!zeigenAktuell(nr) || lektion.gesperrt) return;
    await zeigenSagen(nr, [{ url: 'audio/ansage-zeigen-zeig-mir.wav' }, lautQuelle(lektion.ziel)], `Zeig mir ${lautText(lektion.ziel)}`);
    zeigenWiederholen(nr, rest - 1);
  }, 8000);
}

// Stufe 3: Was ist das? (Kind sagt den Laut, Tipp = Vergleich übers Ohr)
async function zeigenFrage() {
  zeigenStoppen();
  const nr = lektion.nummer;
  const b = lektion.auftraege[lektion.schritt];
  const box = $('#zeigen-karten');
  box.className = 'zeigen-karten einzeln';
  box.innerHTML = '';
  box.appendChild(zeigenKarte(b, ' kommt'));
  // War dieser Buchstabe in Stufe 2 noch unsicher: wie in der Montessori-Lektion zurück zu "Das ist …"
  if (lektion.daneben.has(b)) {
    if (!(await zeigenSagen(nr, [{ url: 'audio/ansage-zeigen-das-ist.wav' }, lautQuelle(b)], `Das ist ${lautText(b)}`))) return;
    lektion.gesperrt = false;
    box.firstChild.classList.add('pulsiert');
    lektion.timer = setTimeout(() => zeigenAktuell(nr) && !lektion.gesperrt && zeigenWeiter(nr), 8000);
    return;
  }
  if (!(await zeigenSagen(nr, [{ url: 'audio/ansage-zeigen-was-ist-das.wav' }], 'Was ist das? Sag es!'))) return;
  // Erst Ruhe zum Selbersagen (Tippen zählt noch nicht), dann sanft pulsieren; ohne Tipp sagt die App den Laut
  lektion.timer = setTimeout(() => {
    if (!zeigenAktuell(nr)) return;
    lektion.gesperrt = false;
    box.firstChild && box.firstChild.classList.add('pulsiert');
    lektion.timer = setTimeout(async () => {
      if (!zeigenAktuell(nr) || lektion.gesperrt) return;
      lektion.gesperrt = true;
      if (await zeigenSagen(nr, [lautQuelle(b)], lautText(b))) zeigenWeiter(nr);
    }, 7000);
  }, 3000);
}

async function zeigenGetippt(b, btn) {
  const jetzt = performance.now();
  if (lektion.gesperrt || jetzt - lektion.letzterTipp < 400) return;
  lektion.letzterTipp = jetzt;
  audio();
  clearTimeout(lektion.timer);
  const nr = lektion.nummer;
  if (lektion.stufe === 1 && b !== lektion.ziel) {
    // Kein "falsch": sanft wackeln, Laut der getippten Karte, dann der gesuchte nochmal
    lektion.gesperrt = true;
    btn.classList.add('blass');
    karteAnimieren(btn, 'wackelt');
    if (!(await zeigenSagen(nr, [lautQuelle(b)], lautText(b)))) return;
    await warten(400);
    if (!(await zeigenSagen(nr, [{ url: 'audio/ansage-zeigen-zeig-mir.wav' }, lautQuelle(lektion.ziel)], `Zeig mir ${lautText(lektion.ziel)}`))) return;
    btn.classList.remove('blass');   // nur kurz blass: kein Lösen durch Ausschließen
    lektion.daneben.add(lektion.ziel);
    lektion.gesperrt = false;
    zeigenWiederholen(nr, 2);
    return;
  }
  lektion.gesperrt = true;
  btn.classList.remove('pulsiert');
  karteAnimieren(btn, 'huepft');
  // Stufe 1 wie beim Sandpapier-Buchstaben: einmal mit dem Finger nachspuren (Hören, Sehen, Tasten)
  if (lektion.stufe === 0) { await warten(500); if (zeigenAktuell(nr)) zeigenSpuren(b, nr); return; }
  if (lektion.stufe === 1) { btn.classList.add('richtig'); glockenspiel(); }
  // Treffer in Stufe 2 bekommen ein kurzes Lob
  if (!(await zeigenSagen(nr, [lautQuelle(b), ...(lektion.stufe === 1 ? lobMitName(b) : [])], lautText(b)))) return;
  await warten(lektion.stufe === 1 ? 900 : 600);
  if (zeigenAktuell(nr)) zeigenWeiter(nr);
}

// Spur-Tafel für den Buchstaben öffnen (ohne Verlauf, ohne Sterne/Sticker); danach zurück in die Lektion
function zeigenSpuren(b, nr) {
  zustand.lektionSpur = { nr, b };
  buchstabeOeffnen(BUCHSTABEN.findIndex((e) => e.b === b), false);
}

function lektionSpurGeschafft() {
  tafelZustand.geschafft = true;
  glockenspiel();
  sterneFliegen();
  vibrieren([30, 40, 30]);
  folgeAbspielen([lautQuelle(zustand.lektionSpur.b)], lautText(zustand.lektionSpur.b));
  // eigener Timer: der Aufbau der Spur-Tafel räumt tafelZustand.jubelTimer weg
  clearTimeout(zustand.lektionSpur.timer);
  zustand.lektionSpur.timer = setTimeout(lektionSpurZurueck, 1400);
}

function lektionSpurZurueck() {
  if (!zustand.lektionSpur) return;
  clearTimeout(zustand.lektionSpur.timer);
  const { nr } = zustand.lektionSpur;
  zustand.lektionSpur = null;
  wiedergabeStoppen();
  zeigen('zeigen', false);
  if (zeigenAktuell(nr)) zeigenWeiter(nr);
}

function zeigenWeiter(nr) {
  if (!zeigenAktuell(nr)) return;
  lektion.punkte++;
  if (lektion.stufe === 0) {
    const feld = $('#zeigen-ablage').children[lektion.schritt];
    feld.innerHTML = strichSvg(legenZeichen(lektion.buchstaben[lektion.schritt]), [-26, 148], 40);
    feld.classList.add('voll');
  }
  lektion.schritt++;
  zeigenPunkteZeichnen();
  if (lektion.schritt < ZEIGEN_STUFEN[lektion.stufe]) { zeigenSchritt(); return; }
  zeigenNaechsteStufe();
}

function zeigenSchritt() {
  if (lektion.stufe === 0) zeigenStufe1();
  else if (lektion.stufe === 1) zeigenAuftrag();
  else zeigenFrage();
}

async function zeigenNaechsteStufe() {
  zeigenStoppen();
  const nr = lektion.nummer;
  glockenspiel();
  if (lektion.stufe === 2) { zeigenGeschafft(); return; }
  lektion.stufe++;
  lektion.schritt = 0;
  zeigenPunkteZeichnen();
  lektion.auftraege = lektion.stufe === 1 ? zeigenAuftraege(lektion.buchstaben) : mischen(lektion.buchstaben);
  lektion.wechsel = true;   // 🔊 wartet, bis die neue Stufe aufgebaut ist
  await warten(700);
  if (!zeigenAktuell(nr)) return;
  lektion.wechsel = false;
  zeigenSymbol();
  $('#zeigen-ablage').hidden = true;
  if (lektion.stufe === 1) {
    // Die drei kommen zusammen: Plätze einmal mischen, dann fest
    const box = $('#zeigen-karten');
    box.className = 'zeigen-karten reihe';
    box.innerHTML = '';
    mischen(lektion.buchstaben).forEach((b) => box.appendChild(zeigenKarte(b, ' kommt')));
  }
  zeigenSchritt();
}

function zeigenGeschafft() {
  const nr = lektion.nummer;
  const jubel = $('#zeigen-jubel');
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  folgeAbspielen([{ url: 'audio/ansage-runde-geschafft.wav' }], 'Alles geschafft! Toll gemacht!');
  lektion.timer = setTimeout(() => zeigenAktuell(nr) && spielEnde('zeigen', zeigenNeu), 2200);
}

function zeigenNeu() {
  zeigenStoppen();
  lektion.buchstaben = zeigenAuswahl();
  lektion.stufe = 0;
  lektion.schritt = 0;
  lektion.punkte = 0;
  lektion.daneben = new Set();
  zeigenPunkteZeichnen();
  $('#zeigen-symbol').textContent = ZEIGEN_SYMBOL[0];
  const ablage = $('#zeigen-ablage');
  ablage.hidden = false;
  ablage.innerHTML = '';
  lektion.buchstaben.forEach((b) => {
    const feld = document.createElement('button');
    feld.className = 'zeigen-feld';
    feld.setAttribute('aria-label', 'Ablage');
    // Schon vorgestellte Buchstaben in der Ablage: Tipp = Laut (sonst nichts)
    feld.addEventListener('click', () => { if (feld.classList.contains('voll') && !lektion.gesperrt) { audio(); folgeAbspielen([lautQuelle(b)]); } });
    ablage.appendChild(feld);
  });
  zeigenSchritt();
}

function zeigenStarten() {
  spielEndeWeg('zeigen');
  zeigen('zeigen');
  zeigenNeu();
}

$('#btn-zeigen-home').addEventListener('click', () => { zeigenStoppen(); wiedergabeStoppen(); zurStartseite(); });
// 🔊: aktuellen Schritt von vorn (Ansage nochmal); geht immer – rettet auch einen hängen gebliebenen Ton
$('#btn-zeigen-laut').addEventListener('click', () => {
  if (lektion.wechsel) return;
  audio();
  lektion.gesperrt = true;
  zeigenSchritt();
});

// ---------- Wörterkiste: Nomenklatur nach Themen (Das ist … / Wo ist … / Was ist das? / bei dir) + Erzähl-Bild ----------

const KISTE_STUFEN = [3, 6, 3];   // Schritte je Stufe; Stufe 4 (bei dir / Tierlaut) ist ein Schritt mehr
// Symbole je Stufe; in der Körper-Kiste nicht 👀/👂 (wären zugleich die Wörter Auge/Ohr); Stufe 4 nicht 🏠 (= Zurück)
const kisteSymbole = () => [...(kiste.kiste && kiste.kiste.id === 'koerper' ? ['✨', '🔎'] : ['👀', '👂']), '🗣️',
  kiste.kiste && kiste.kiste.stufe4 === 'tiere' ? '🎵' : '👉'];
const KISTE_ZEIT_BEI_DIR = { koerper: 20000 };   // sonst 40 s: Löffel oder Seife holen dauert
const KISTE_NACHMACHEN = 5500;                   // Zeit, das Tier nachzumachen
const kiste = { kiste: null, woerter: [], stufe: 0, schritt: 0, punkte: 0, auftraege: [], ziel: null, daneben: new Set(),
  gesperrt: true, wechsel: false, fertig: false, fehlversuche: 0, beiDir: null, timer: null, nummer: 0, letzterTipp: 0, zuletzt: {} };

const kisteAktuell = (nr) => nr === kiste.nummer && $('#kiste').classList.contains('active');
// Eigenes Foto der Eltern (Studio → Kisten → 📷) statt Emoji: der echte Löffel aus der eigenen Küche
const kisteFoto = (id) => (medien[`datei:kiste-${id}.wav`] || medien[`w-${id}`] || {}).bildUrl;
const kisteBildHtml = (id, emoji) => (kisteFoto(id) ? `<img class="kiste-foto" src="${kisteFoto(id)}" alt="">` : emoji);
const kisteWort = (id) => kiste.kiste.woerter.find((w) => w[0] === id);
const kisteQuelle = (id) => (kiste.kiste.eigen && (medien[`w-${id}`] || {}).stimme ? blobQuelle(medien[`w-${id}`].stimme) : { url: kisteDatei(id) });
const kisteText = (id) => kisteWort(id)[1];
const kistePunkteGesamt = () => KISTE_STUFEN.reduce((a, b) => a + b, 0) + (kiste.kiste && kiste.kiste.stufe4 ? 1 : 0);

// 3 der 6 Wörter: zuerst die, die beim letzten Mal nicht dran waren; nie zwei zu ähnliche zusammen
function kisteAuswahl(k) {
  const alle = k.woerter.map((w) => w[0]);
  // Nur noch vorhandene Wörter (in eigenen Kisten können Eltern Wörter löschen)
  const vorher = (kiste.zuletzt[k.id] || []).filter((id) => alle.includes(id));
  const ids = [...mischen(alle.filter((id) => !vorher.includes(id))), ...mischen(vorher)];
  const wahl = [];
  ids.forEach((id) => {
    if (wahl.length < 3 && !wahl.some((x) => KISTEN_NICHT_ZUSAMMEN.some((p) => p.includes(x) && p.includes(id)))) wahl.push(id);
  });
  kiste.zuletzt[k.id] = wahl;
  return wahl;
}

function kisteStoppen() {
  clearTimeout(kiste.timer);
  kiste.nummer++;
  kiste.gesperrt = true;
  kiste.wechsel = false;
  $('#btn-kiste-daumen').hidden = true;
}

async function kisteSagen(nr, folge, text) {
  await folgeAbspielen(folge, text);
  return kisteAktuell(nr);
}

function kistePunkteZeichnen() {
  const gruppen = [...KISTE_STUFEN, ...(kiste.kiste && kiste.kiste.stufe4 ? [1] : [])];
  let n = 0;
  $('#kiste-runden').innerHTML = gruppen.map((anzahl) => `<span class="punkt-gruppe">${
    Array.from({ length: anzahl }, () => `<span class="${n++ < kiste.punkte ? 'voll' : ''}"></span>`).join('')}</span>`).join('');
}

function kisteKarte(id, extra = '') {
  const btn = document.createElement('button');
  btn.className = `zeigen-karte kiste-karte${extra}`;
  btn.innerHTML = kisteBildHtml(id, kisteWort(id)[2]);
  btn.setAttribute('aria-label', kisteText(id));
  btn.addEventListener('click', () => kisteGetippt(id, btn));
  return btn;
}

function kisteEinzeln(id) {
  const box = $('#kiste-karten');
  box.className = 'zeigen-karten einzeln';
  box.innerHTML = '';
  box.appendChild(kisteKarte(id, ' kommt'));
  return box.firstChild;
}

function kisteSymbol() {
  const s = $('#kiste-symbol');
  s.textContent = kisteSymbole()[kiste.stufe];
  karteAnimieren(s, 'huepft');
}

// Eigene Kisten: Wörter, Fotos und Aufnahmen legen die Eltern im Elternbereich an (profil.kistenWoerter).
// Spielbar ab KISTE_MIN Wörtern mit Foto UND Aufnahme; ohne „bei dir“-Stufe (Oma oder die Rutsche sind nicht im Zimmer).
const EIGENE_KISTEN = [
  { id: 'leute', name: 'Meine Leute', bild: '👨‍👩‍👧', werIst: true, beispiel: '„Ja, ihr wart zusammen im Park – und was habt ihr da gemacht?“',
    frage: (wort, i) => [`Was machst du gern mit ${wort}?`, `Was sagt ${wort} oft zu dir?`, `Wo wohnt ${wort}?`][i % 3], beispielWort: 'Oma oder Frau Yilmaz',
    eingabe: 'Name, wie Ihr Kind ihn sagt',
    hinweis: 'Menschen aus dem Leben Ihres Kindes: Oma, Opa, Geschwister, Freunde (bei Kindern: deren Eltern fragen), die Erzieherin – besonders hilfreich bei neuen '
      + 'Menschen, z. B. vor und in der Eingewöhnung. Ein Foto je Person, Gesicht groß, möglichst allein im Bild. Nur den Namen '
      + 'sprechen, langsam und deutlich („Oma“, nicht „Das ist Oma“ – das sagt die App selbst). Nur mit Einverständnis der Person. '
      + 'Wer nicht mehr da ist oder nicht mehr kommt, lieber gemeinsam im Fotoalbum anschauen als im Spiel. '
      + 'Namen aus einem Wort (Oma, Papa, Ela) kann Ihr Kind auch bei ✍️ „Mein Name“ nachspuren – je Person ein- und ausschaltbar.' },
  { id: 'kita', name: 'Meine Kita', bild: '🏫', beispiel: '„Ja, an der Garderobe hängt deine Jacke.“',
    frage: (wort, i) => ['Was machst du da am liebsten?', 'Was spielst du da?', 'Zeig mal, wie du das da machst!'][i % 3], beispielWort: 'die Rutsche',
    eingabe: 'Wort mit Artikel',
    hinweis: 'Orte und Dinge aus der Kita oder dem Alltag: Garderobe, Rutsche, Sandkasten. Nah fotografieren, nur der eine Ort oder '
      + 'das eine Ding, keine anderen Kinder auf den Fotos. Fragen Sie in der Kita, ob Sie dort fotografieren dürfen – sonst geht es '
      + 'auch zu Hause: eigene Jacke, Kita-Tasche, der Weg dorthin. Nur das Wort mit Artikel sprechen („die Rutsche“).' },
];
const KISTE_MIN = 3;
const KISTE_MAX = 6;
const kistenWortFertig = (w) => !!(medien[`w-${w.id}`] && medien[`w-${w.id}`].bildUrl && medien[`w-${w.id}`].stimme);
function eigeneKiste(def, nurFertige = true) {
  const woerter = eigeneKistenWoerter.filter((w) => w.kiste === def.id && (!nurFertige || kistenWortFertig(w)));
  return { ...def, eigen: true, stufe4: null, woerter: woerter.map((w, i) => [w.id, w.wort, '💛', def.frage(w.wort, i)]) };
}
const spielbareKisten = () => [...KISTEN, ...EIGENE_KISTEN.map((d) => eigeneKiste(d)).filter((k) => k.woerter.length >= KISTE_MIN)];
const alleKisten = () => [...KISTEN, ...EIGENE_KISTEN.map((d) => eigeneKiste(d, false))];

// Kisten-Wahl: große Kacheln mit dem Symbol der Kiste (ohne Text)
function kistenWahlZeigen() {
  kisteStoppen();
  spielEndeWeg('kiste');
  $('#kiste-lektion').hidden = true;
  $('#kiste-erzaehlen').hidden = true;
  $('#btn-kiste-laut').hidden = true;   // 🔊 nur in der Lektion
  $('#kiste-runden').innerHTML = '';
  const box = $('#kiste-wahl');
  box.hidden = false;
  box.innerHTML = '';
  folgeAbspielen([{ url: 'audio/ansage-kiste-aussuchen.wav' }], 'Such dir eine Kiste aus!');
  spielbareKisten().forEach((k) => {
    const btn = document.createElement('button');
    btn.className = 'spiel-btn kiste-wahl-btn';
    // Eigene Kisten zeigen ein eigenes Foto (ein bekanntes Gesicht erkennt das Kind sofort)
    btn.innerHTML = k.eigen ? kisteBildHtml(k.woerter[0][0], k.bild) : k.bild;
    btn.setAttribute('aria-label', k.name);
    btn.addEventListener('click', () => { audio(); kisteNeu(k); });
    box.appendChild(btn);
  });
}

function kisteNeu(k) {
  kisteStoppen();
  spielEndeWeg('kiste');
  kiste.kiste = k;
  kiste.woerter = kisteAuswahl(k);
  kiste.stufe = 0;
  kiste.schritt = 0;
  kiste.punkte = 0;
  kiste.daneben = new Set();
  kiste.fertig = false;
  $('#kiste-wahl').hidden = true;
  $('#kiste-erzaehlen').hidden = true;
  $('#kiste-lektion').hidden = false;
  $('#btn-kiste-laut').hidden = false;
  $('#kiste-symbol').textContent = kisteSymbole()[0];
  const ablage = $('#kiste-ablage');
  ablage.hidden = false;
  ablage.innerHTML = '';
  kiste.woerter.forEach((id) => {
    const feld = document.createElement('button');
    feld.className = 'zeigen-feld kiste-feld';
    feld.setAttribute('aria-label', 'Ablage');
    feld.addEventListener('click', () => { if (feld.classList.contains('voll') && !kiste.gesperrt) { audio(); folgeAbspielen([kisteQuelle(id)]); } });
    ablage.appendChild(feld);
  });
  kistePunkteZeichnen();
  kisteSchritt();
}

function kisteSchritt() {
  if (kiste.stufe === 0) kisteVorstellen();
  else if (kiste.stufe === 1) kisteAuftrag();
  else if (kiste.stufe === 2) kisteFrage();
  else kisteBeiDir();
}

// Stufe 1: Das ist … die Tasse (Tipp = Wort nochmal, dann in die Ablage; ohne Tipp geht es von selbst weiter)
async function kisteVorstellen(id = kiste.woerter[kiste.schritt]) {
  kisteStoppen();
  const nr = kiste.nummer;
  const karte = kisteEinzeln(id);
  if (!(await kisteSagen(nr, [{ url: 'audio/ansage-zeigen-das-ist.wav' }, kisteQuelle(id)], `Das ist ${kisteText(id)}`))) return;
  kiste.gesperrt = false;
  karte.classList.add('pulsiert');
  kiste.timer = setTimeout(async () => {
    if (!kisteAktuell(nr)) return;
    await kisteSagen(nr, [kisteQuelle(id)], kisteText(id));
    kiste.timer = setTimeout(() => kisteAktuell(nr) && !kiste.gesperrt && kisteWeiter(nr), 8000);
  }, 6000);
}

// Stufe 2: Wo ist … die Tasse? (drei Bilder, Plätze nach der Hälfte einmal getauscht)
async function kisteAuftrag() {
  kisteStoppen();
  const nr = kiste.nummer;
  kiste.ziel = kiste.auftraege[kiste.schritt];
  kiste.fehlversuche = 0;
  document.querySelectorAll('#kiste-karten .zeigen-karte').forEach((k) => k.classList.remove('blass', 'richtig', 'pulsiert'));
  if (kiste.schritt === 3) {
    const box = $('#kiste-karten');
    const alt = [...box.children];
    let neu = mischen(alt);
    while (neu.every((k, i) => k === alt[i])) neu = mischen(alt);
    neu.forEach((k) => { k.classList.remove('kommt'); void k.offsetWidth; k.classList.add('kommt'); box.appendChild(k); });
    await warten(500);
    if (!kisteAktuell(nr)) return;
  }
  if (!(await kisteSagen(nr, [{ url: 'audio/ansage-kiste-wo-ist.wav' }, kisteQuelle(kiste.ziel)], `Wo ist ${kisteText(kiste.ziel)}?`))) return;
  kiste.gesperrt = false;
  kisteWiederholen(nr, 2);
}

function kisteWiederholen(nr, rest) {
  clearTimeout(kiste.timer);
  if (!rest) return;
  kiste.timer = setTimeout(async () => {
    if (!kisteAktuell(nr) || kiste.gesperrt) return;
    await kisteSagen(nr, [{ url: 'audio/ansage-kiste-wo-ist.wav' }, kisteQuelle(kiste.ziel)], `Wo ist ${kisteText(kiste.ziel)}?`);
    kisteWiederholen(nr, rest - 1);
  }, 8000);
}

// Stufe 3: Was ist das? Sag es! (Ruhe zum Selbersagen, Tipp = Vergleich; Unsicheres nochmal vorstellen)
async function kisteFrage() {
  const id = kiste.auftraege[kiste.schritt];
  if (kiste.daneben.has(id)) { kisteVorstellen(id); return; }
  kisteStoppen();
  const nr = kiste.nummer;
  const karte = kisteEinzeln(id);
  const frage = kiste.kiste.werIst ? ['kiste-wer-ist-das', 'Wer ist das? Sag es!'] : ['zeigen-was-ist-das', 'Was ist das? Sag es!'];
  if (!(await kisteSagen(nr, [{ url: `audio/ansage-${frage[0]}.wav` }], frage[1]))) return;
  kiste.timer = setTimeout(() => {
    if (!kisteAktuell(nr)) return;
    kiste.gesperrt = false;
    karte.classList.add('pulsiert');
    kiste.timer = setTimeout(async () => {
      if (!kisteAktuell(nr) || kiste.gesperrt) return;
      kiste.gesperrt = true;
      if (await kisteSagen(nr, [kisteQuelle(id)], kisteText(id))) kisteWeiter(nr);
    }, 7000);
  }, 3000);
}

// Stufe 4: „Wo ist bei dir …?“ (zeigen/holen, dann 👍) oder „Wie macht …?“ (nachmachen, dann der Tierlaut)
async function kisteBeiDir() {
  kisteStoppen();
  const nr = kiste.nummer;
  // Einmal gewählt bleibt das Wort (auch wenn 🔊 die Frage wiederholt)
  const id = kiste.beiDir || (kiste.beiDir = zufall(kiste.woerter));
  kisteEinzeln(id);
  if (kiste.kiste.stufe4 === 'tiere') {
    if (!(await kisteSagen(nr, [{ url: 'audio/ansage-kiste-wie-macht.wav' }, kisteQuelle(id)], `Wie macht ${kisteText(id)}?`))) return;
    await warten(KISTE_NACHMACHEN);
    if (!kisteAktuell(nr)) return;
    if (!(await kisteSagen(nr, [{ url: tierDatei(id) }], TIERLAUTE[id]))) return;
    kisteGeschafft(nr);
    return;
  }
  if (!(await kisteSagen(nr, [{ url: 'audio/ansage-kiste-wo-ist-bei-dir.wav' }, kisteQuelle(id)], `Wo ist bei dir ${kisteText(id)}?`))) return;
  kiste.gesperrt = false;
  $('#btn-kiste-daumen').hidden = false;
  // Ohne Tipp freundlich weiter (kein Warten auf den Daumen); Tipp aufs Bild zählt wie 👍
  kiste.timer = setTimeout(() => kisteAktuell(nr) && !kiste.gesperrt && kisteGeschafft(nr),
    KISTE_ZEIT_BEI_DIR[kiste.kiste.id] || 40000);
}

async function kisteGeschafft(nr) {
  if (kiste.fertig) return;
  kiste.fertig = true;
  kiste.gesperrt = true;
  clearTimeout(kiste.timer);
  $('#btn-kiste-daumen').hidden = true;
  kiste.punkte++;
  kistePunkteZeichnen();
  glockenspiel();
  if (!(await kisteSagen(nr, lobMitName(), 'Super!'))) return;
  kisteErzaehlen();
}

async function kisteGetippt(id, btn) {
  const jetzt = performance.now();
  // Stufe 3 in der Ruhe zum Selbersagen: sanft wackeln, damit es nicht kaputt wirkt (zählt nicht)
  if (kiste.gesperrt && kiste.stufe === 2 && !btn.classList.contains('pulsiert')) { karteAnimieren(btn, 'wackelt'); return; }
  if (kiste.gesperrt || jetzt - kiste.letzterTipp < 400) return;
  kiste.letzterTipp = jetzt;
  audio();
  const nr = kiste.nummer;
  if (kiste.stufe === 3) {   // Stufe 4: Tipp aufs Bild = „gezeigt“ (wie 👍); bei den Tieren nur anschauen
    if (kiste.kiste.stufe4 === 'bei-dir') kisteGeschafft(nr);
    return;
  }
  clearTimeout(kiste.timer);
  if (kiste.stufe === 1 && id !== kiste.ziel) {
    // Kein "falsch": wackeln, das getippte Bild benennen, dann nochmal fragen
    kiste.gesperrt = true;
    btn.classList.add('blass');
    karteAnimieren(btn, 'wackelt');
    if (!(await kisteSagen(nr, [kisteQuelle(id)], kisteText(id)))) return;
    await warten(400);
    if (!(await kisteSagen(nr, [{ url: 'audio/ansage-kiste-wo-ist.wav' }, kisteQuelle(kiste.ziel)], `Wo ist ${kisteText(kiste.ziel)}?`))) return;
    btn.classList.remove('blass');
    kiste.daneben.add(kiste.ziel);
    // Nach zwei Fehlversuchen: das gesuchte Bild pulsiert sanft (Hinweis, kein „falsch“)
    if (++kiste.fehlversuche >= 2) document.querySelectorAll('#kiste-karten .zeigen-karte').forEach((k) => k.getAttribute('aria-label') === kisteText(kiste.ziel) && k.classList.add('pulsiert'));
    kiste.gesperrt = false;
    kisteWiederholen(nr, 2);
    return;
  }
  kiste.gesperrt = true;
  btn.classList.remove('pulsiert');
  karteAnimieren(btn, 'huepft');
  if (kiste.stufe === 1) { btn.classList.add('richtig'); glockenspiel(); }
  if (!(await kisteSagen(nr, [kisteQuelle(id), ...(kiste.stufe === 1 ? lobMitName() : [])], kisteText(id)))) return;
  await warten(kiste.stufe === 1 ? 900 : 600);
  if (kisteAktuell(nr)) kisteWeiter(nr);
}

function kisteWeiter(nr) {
  if (!kisteAktuell(nr)) return;
  kiste.punkte++;
  if (kiste.stufe === 0 && kiste.schritt < kiste.woerter.length) {
    const feld = $('#kiste-ablage').children[kiste.schritt];
    feld.innerHTML = kisteBildHtml(kiste.woerter[kiste.schritt], kisteWort(kiste.woerter[kiste.schritt])[2]);
    feld.classList.add('voll');
  }
  kiste.schritt++;
  kistePunkteZeichnen();
  if (kiste.schritt < KISTE_STUFEN[kiste.stufe]) { kisteSchritt(); return; }
  kisteNaechsteStufe();
}

async function kisteNaechsteStufe() {
  kisteStoppen();
  const nr = kiste.nummer;
  glockenspiel();
  if (kiste.stufe === 2 && !kiste.kiste.stufe4) { kisteErzaehlen(); return; }
  kiste.stufe++;
  kiste.schritt = 0;
  if (kiste.stufe === 1) kiste.auftraege = zeigenAuftraege(kiste.woerter);
  else if (kiste.stufe === 2) kiste.auftraege = mischen(kiste.woerter);
  else kiste.beiDir = null;
  kiste.wechsel = true;   // 🔊 wartet, bis die neue Stufe aufgebaut ist
  await warten(700);
  if (!kisteAktuell(nr)) return;
  kiste.wechsel = false;
  kisteSymbol();
  $('#kiste-ablage').hidden = true;
  if (kiste.stufe === 1) {
    const box = $('#kiste-karten');
    box.className = 'zeigen-karten reihe';
    box.innerHTML = '';
    mischen(kiste.woerter).forEach((id) => box.appendChild(kisteKarte(id, ' kommt')));
  }
  kisteSchritt();
}

// Erzähl-Bild: die drei Bilder der Runde und Gesprächsfragen für die Eltern; dann 🏠 / 🔁
// Erzähl-Bild: die drei Bilder der Runde (antippen = Wort) und je Wort eine Gesprächsfrage für die Eltern.
// 🏠/🔁 erst nach einer Weile – zuerst soll erzählt werden; 🔁 führt zur Kisten-Wahl (Abwechslung)
const KISTE_ERZAEHLZEIT = 15000;
function kisteErzaehlen() {
  kisteStoppen();
  $('#kiste-lektion').hidden = true;
  $('#btn-kiste-laut').hidden = true;
  const box = $('#kiste-erzaehlen');
  box.hidden = false;
  const bilder = $('#kiste-erzaehl-bilder');
  bilder.innerHTML = '';
  kiste.woerter.forEach((id) => {
    const btn = document.createElement('button');
    btn.innerHTML = kisteBildHtml(id, kisteWort(id)[2]);
    btn.setAttribute('aria-label', kisteText(id));
    btn.addEventListener('click', () => { audio(); folgeAbspielen([kisteQuelle(id)]); });
    bilder.appendChild(btn);
  });
  $('#kiste-fragen').innerHTML = [...new Set(kiste.woerter.map((id) => kisteWort(id)[3]))].map((f) => `<li>${htmlText(f)}</li>`).join('');
  $('#kiste-beispiel').textContent = kiste.kiste.beispiel;
  kiste.erzaehlId = null;   // eine Erzählung je Runde (nochmal aufnehmen ersetzt sie)
  $('#btn-kiste-erzaehlen').classList.remove('fertig');
  $('#btn-kiste-erzaehlen').hidden = true;
  mikrofonErlaubt().then((ja) => { $('#btn-kiste-erzaehlen').hidden = !ja; });
  folgeAbspielen([{ url: 'audio/ansage-runde-geschafft.wav' }], 'Alles geschafft! Toll gemacht!');
  const nr = kiste.nummer;
  kiste.timer = setTimeout(() => kisteAktuell(nr) && spielEnde('kiste', kistenWahlZeigen), KISTE_ERZAEHLZEIT);
}

// Das Kind erzählt: Aufnahme bleibt auf dem Gerät, gehört dem Kind (wie die Funde der Jagd) und erscheint im Album
async function kisteErzaehlungGesetzt(blob) {
  folgeAbspielen([blobQuelle(blob)]);   // sich selbst hören
  const besitzer = `fund-${fundBesitzer()}`;
  const id = kiste.erzaehlId || `e${Date.now().toString(36)}`;
  if (!(await datenbank.medienSetzen(besitzer, id, 'stimme', blob))) return;
  speicherSchuetzen();
  if (!kiste.erzaehlId) {
    zustand.funde = [...(zustand.funde || []), { id, art: 'erzaehlung', kiste: kiste.kiste.id, woerter: kiste.woerter.slice(), zeit: Date.now() }];
    await einstellungenSpeichern();
  }
  kiste.erzaehlId = id;
  $('#btn-kiste-erzaehlen').classList.add('fertig');
}

function kisteStarten() {
  zeigen('kiste');
  kistenWahlZeigen();
}

$('#btn-kiste-home').addEventListener('click', () => { kisteStoppen(); wiedergabeStoppen(); zurStartseite(); });
$('#btn-kiste-erzaehlen').addEventListener('click', (e) => { audio(); aufnehmen(e.currentTarget, kisteErzaehlungGesetzt, 15000, true); });
$('#btn-kiste-daumen').addEventListener('click', () => { if (!kiste.gesperrt) { audio(); kisteGeschafft(kiste.nummer); } });
// 🔊: aktuellen Schritt von vorn (rettet auch einen hängen gebliebenen Ton)
$('#btn-kiste-laut').addEventListener('click', () => {
  if ($('#kiste-lektion').hidden || kiste.wechsel || kiste.fertig) return;
  audio();
  kiste.gesperrt = true;
  $('#btn-kiste-daumen').hidden = true;
  kisteSchritt();
});

// ---------- Reim-Paare: Was reimt sich auf …? (eher fürs 4-jährige Kind) ----------

const REIM_RUNDEN = ['leicht', 'leicht', 'leicht', 'mittel', 'mittel'];   // Stufe je Runde
const reim = { runde: 0, paar: null, ziel: null, partner: null, karten: [], gesperrt: true, treffer: false, timer: null, nummer: 0, letzterTipp: 0, vorher: [] };

const reimAktuell = (nr) => nr === reim.nummer && $('#reime').classList.contains('active');
const reimQuelle = (w) => ({ url: w[3] });

function reimStoppen() {
  clearTimeout(reim.timer);
  reim.nummer++;
  reim.gesperrt = true;
}

async function reimSagen(nr, folge, text) {
  await folgeAbspielen(folge, text);
  return reimAktuell(nr);
}

// Ablenker: aus einem anderen Paar, anderer betonter Vokal, anderer Anlaut als das Ziel (sonst wählt das Kind nach Klang)
function reimAblenker(paar, ziel) {
  const andere = REIME.filter((p) => p !== paar && p.vokal !== paar.vokal).flatMap((p) => p.woerter);
  const kandidaten = andere.filter((w) => reimAnlaut(w[1]) !== reimAnlaut(ziel[1]));
  return zufall(kandidaten.length ? kandidaten : andere);   // Schutz, falls künftige Daten keinen passenden Ablenker hergeben
}

function reimKarte(w, extra = '') {
  const btn = document.createElement('button');
  btn.className = `zeigen-karte kiste-karte reim-karte${extra}`;
  btn.textContent = w[2];
  btn.setAttribute('aria-label', w[1]);
  return btn;
}

function reimRundenAnzeigen() {
  $('#reime-runden').innerHTML = REIM_RUNDEN.map((_, i) => `<span class="${i < reim.runde ? 'voll' : ''}"></span>`).join('');
}

// Wörter unten nacheinander vorsprechen (das Kind muss die Bilder nicht selbst benennen)
async function reimKartenVorsprechen(nr) {
  for (const btn of document.querySelectorAll('#reime-karten .reim-karte')) {
    karteAnimieren(btn, 'huepft');
    if (!(await reimSagen(nr, [reimQuelle(reim.karten.find((w) => w[1] === btn.getAttribute('aria-label')))], btn.getAttribute('aria-label')))) return false;
  }
  return true;
}

// Einmal pro Spielstart vormachen: „Hör mal: Maus … Haus. Das reimt sich!“
async function reimVormachen() {
  reimStoppen();
  const nr = reim.nummer;
  const [a, b] = REIME[0].woerter;
  $('#reime-ziel').innerHTML = '';
  $('#reime-ziel').appendChild(reimKarte(a));
  const box = $('#reime-karten');
  box.innerHTML = '';
  box.appendChild(reimKarte(b, ' kommt'));
  reimRundenAnzeigen();
  if (!(await reimSagen(nr, [{ url: 'audio/ansage-reim-hoer-mal.wav' }, reimQuelle(a), reimQuelle(b), { url: 'audio/ansage-reim-das-reimt.wav' }],
    `Hör mal: ${a[1]} … ${b[1]}. Das reimt sich!`))) return;
  await warten(600);
  if (reimAktuell(nr)) reimNeueRunde();
}

async function reimNeueRunde() {
  reimStoppen();
  const nr = reim.nummer;
  const stufe = REIM_RUNDEN[reim.runde];
  const auswahl = REIME.filter((p) => p.stufe === stufe && !reim.vorher.includes(p));
  reim.paar = zufall(auswahl.length ? auswahl : REIME.filter((p) => p.stufe === stufe));
  reim.vorher = [...reim.vorher.slice(-3), reim.paar];
  const i = Math.random() < 0.5 ? 0 : 1;
  reim.ziel = reim.paar.woerter[i];
  reim.partner = reim.paar.woerter[1 - i];
  reim.karten = mischen([reim.partner, reimAblenker(reim.paar, reim.ziel)]);
  reim.treffer = false;
  reimRundenAnzeigen();
  $('#reime-ziel').innerHTML = '';
  $('#reime-ziel').appendChild(reimKarte(reim.ziel, ' kommt'));
  const box = $('#reime-karten');
  box.innerHTML = '';
  reim.karten.forEach((w) => {
    const btn = reimKarte(w, ' kommt');
    btn.addEventListener('click', () => reimGetippt(w, btn));
    box.appendChild(btn);
  });
  await reimFragen(nr);
}

async function reimFragen(nr) {
  reim.gesperrt = true;
  if (!(await reimSagen(nr, [{ url: 'audio/ansage-reim-frage.wav' }, reimQuelle(reim.ziel)], `Was reimt sich auf ${reim.ziel[1]}?`))) return;
  if (!(await reimKartenVorsprechen(nr))) return;
  reim.gesperrt = false;
}

async function reimGetippt(w, btn) {
  const jetzt = performance.now();
  if (reim.gesperrt || btn.classList.contains('blass') || jetzt - reim.letzterTipp < 400) return;
  reim.letzterTipp = jetzt;
  audio();
  const nr = reim.nummer;
  reim.gesperrt = true;
  if (w !== reim.partner) {
    // Kein „falsch“: beide Wörter hören („Maus … Hund“), dann der Hinweis; das passende Bild pulsiert
    btn.classList.add('blass');
    karteAnimieren(btn, 'wackelt');
    if (!(await reimSagen(nr, [reimQuelle(reim.ziel), reimQuelle(w), { url: 'audio/ansage-hoeren-nochmal.wav' }], `${reim.ziel[1]} … ${w[1]}`))) return;
    document.querySelectorAll('#reime-karten .reim-karte').forEach((k) => k.getAttribute('aria-label') === reim.partner[1] && k.classList.add('pulsiert'));
    reim.gesperrt = false;
    return;
  }
  // Treffer: das Paar zusammen hören – „Maus – Haus. Das reimt sich!“
  reim.treffer = true;
  btn.classList.remove('pulsiert');
  btn.classList.add('richtig');
  karteAnimieren(btn, 'huepft');
  glockenspiel();
  reim.runde++;
  reimRundenAnzeigen();
  if (!(await reimSagen(nr, [reimQuelle(reim.ziel), reimQuelle(w), { url: 'audio/ansage-reim-das-reimt.wav' }], `${reim.ziel[1]} – ${w[1]}. Das reimt sich!`))) return;
  reim.timer = setTimeout(() => {
    if (!reimAktuell(nr)) return;
    if (reim.runde >= REIM_RUNDEN.length) reimGeschafft(); else reimNeueRunde();
  }, 900);
}

function reimGeschafft() {
  const nr = reim.nummer;
  const jubel = $('#reime-jubel');
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  glockenspiel();
  folgeAbspielen([{ url: 'audio/ansage-runde-geschafft.wav' }], 'Alles geschafft! Toll gemacht!');
  reim.timer = setTimeout(() => reimAktuell(nr) && spielEnde('reime', () => { reim.runde = 0; (zustand.reimHoeren ? reimHoerRunde : reimNeueRunde)(); }), 2200);
}

// Leichte Stufe für Jüngere („Reime hören“, je Kind im Elternbereich): keine Auswahl – das Paar hören,
// beide Bilder antippen, dann „Jetzt du!“ zum Mitsprechen (wie die Montessori-Darbietung: erst zeigen und hören)
async function reimHoerRunde() {
  reimStoppen();
  const nr = reim.nummer;
  const auswahl = REIME.filter((p) => p.stufe === 'leicht' && !reim.vorher.includes(p));
  reim.paar = zufall(auswahl.length ? auswahl : REIME.filter((p) => p.stufe === 'leicht'));
  reim.vorher = [...reim.vorher.slice(-3), reim.paar];
  [reim.ziel, reim.partner] = mischen(reim.paar.woerter);
  reim.karten = [reim.partner];
  reim.treffer = false;
  reim.angetippt = new Set();
  reimRundenAnzeigen();
  $('#reime-ziel').innerHTML = '';
  const oben = reimKarte(reim.ziel, ' kommt');
  oben.addEventListener('click', () => reimHoerGetippt(reim.ziel, oben));
  $('#reime-ziel').appendChild(oben);
  const box = $('#reime-karten');
  box.innerHTML = '';
  const unten = reimKarte(reim.partner, ' kommt');
  unten.addEventListener('click', () => reimHoerGetippt(reim.partner, unten));
  box.appendChild(unten);
  if (!(await reimSagen(nr, [{ url: 'audio/ansage-reim-hoer-mal.wav' }, reimQuelle(reim.ziel), reimQuelle(reim.partner),
    { url: 'audio/ansage-reim-das-reimt.wav' }], `Hör mal: ${reim.ziel[1]} … ${reim.partner[1]}. Das reimt sich!`))) return;
  reim.gesperrt = false;
  oben.classList.add('pulsiert');
  unten.classList.add('pulsiert');
  // Tippt das Kind nicht: Paar nach 12 s noch einmal, dann geht es zum Mitsprechen weiter
  reim.timer = setTimeout(async () => {
    if (!reimAktuell(nr) || reim.treffer) return;
    reim.gesperrt = true;
    if (await reimSagen(nr, [reimQuelle(reim.ziel), reimQuelle(reim.partner)], `${reim.ziel[1]} – ${reim.partner[1]}`)) reimHoerMitsprechen(nr);
  }, 12000);
}

async function reimHoerGetippt(w, btn) {
  const jetzt = performance.now();
  if (reim.gesperrt || reim.treffer || jetzt - reim.letzterTipp < 400) return;
  reim.letzterTipp = jetzt;
  audio();
  const nr = reim.nummer;
  btn.classList.remove('pulsiert');
  karteAnimieren(btn, 'huepft');
  reim.angetippt.add(w[0]);
  reim.gesperrt = true;
  if (!(await reimSagen(nr, [reimQuelle(w)], w[1]))) return;
  if (reim.angetippt.size < 2) { reim.gesperrt = false; return; }
  clearTimeout(reim.timer);
  reimHoerMitsprechen(nr);
}

async function reimHoerMitsprechen(nr) {
  reim.treffer = true;
  reim.gesperrt = true;
  if (!(await reimSagen(nr, [reimQuelle(reim.ziel), reimQuelle(reim.partner), { url: 'audio/ansage-silben-jetzt-du.wav' }],
    `${reim.ziel[1]} – ${reim.partner[1]}. Jetzt du!`))) return;
  await warten(4000);   // Zeit zum Mitsprechen (wird nicht geprüft)
  if (!reimAktuell(nr)) return;
  glockenspiel();
  reim.runde++;
  reimRundenAnzeigen();
  reim.timer = setTimeout(() => {
    if (!reimAktuell(nr)) return;
    if (reim.runde >= REIM_RUNDEN.length) reimGeschafft(); else reimHoerRunde();
  }, 900);
}

function reimStarten() {
  reim.runde = 0;
  reim.vorher = [REIME[0]];   // das vorgemachte Paar nicht gleich als erste Aufgabe
  spielEndeWeg('reime');
  zeigen('reime');
  if (zustand.reimHoeren) reimHoerRunde(); else reimVormachen();
}

$('#btn-reime-home').addEventListener('click', () => { reimStoppen(); wiedergabeStoppen(); zurStartseite(); });
// 🔊: Frage und beide Wörter nochmal – geht immer (rettet auch einen hängen gebliebenen Ton), nur nicht nach dem Treffer
$('#btn-reime-laut').addEventListener('click', () => {
  if (!reim.ziel || reim.treffer) return;
  audio();
  if (zustand.reimHoeren) { reimHoerRunde(); return; }
  reimStoppen();
  reimFragen(reim.nummer);
});
// Zielbild antippen = Zielwort nochmal
$('#reime-ziel').addEventListener('click', () => { if (!zustand.reimHoeren && !reim.gesperrt && reim.ziel) { audio(); folgeAbspielen([reimQuelle(reim.ziel)]); } });

// ---------- Silben-Trommel: pro Silbe einmal auf die Trommel hauen ----------

// Silbenzahl je Runde: mit 2 beginnen, 1 Silbe nicht direkt nach dem ersten Erfolg, mit einem leichteren Wort enden
const SILBEN_RUNDEN = [2, 2, 1, 3, 2];
const SILBEN_VORMACHEN = 2;        // so viele Runden trommelt die App erst vor ("Hör zu! … Jetzt du!")
const SILBEN_TAKT_VOR = 850;       // ms zwischen den Silben beim Vormachen (zum Nachmachen langsamer)
const SILBEN_TAKT_BESTAETIGEN = 650;
const SILBEN_TAKT_ZUSAMMEN = 950;
const SILBEN_FERTIG_NACH = 2000;   // so lange Pause nach dem letzten Schlag = fertig
const SILBEN_ZITTERN = 180;        // Schläge kürzer hintereinander zählen nicht (Doppeltipp, zwei Hände)
const SILBEN_DAUER_MAX = 6000;     // länger ohne Pause trommeln = wildes Trommeln, dann hilft die App
const silben = {
  wahl: null, teile: [], runde: 0, versuch: 0, phase: 'aus', schlaege: 0, letzter: 0, start: 0,
  erinnert: 0, zusammenVorher: false, timer: null, erinnerTimer: null, nummer: 0, vorher: [],
  bereit: new Set(),   // Wörter, deren Silben-Aufnahmen alle da sind
};

const warten = (ms) => new Promise((r) => setTimeout(r, ms));

// Ohne gesprochene Silben lernt das Kind nur Bumms zählen – das Spiel erscheint erst, wenn Aufnahmen da sind
async function silbenPruefen() {
  await Promise.all(Object.entries(SILBEN).map(async ([wort, teile]) => {
    try {
      const da = await Promise.all(teile.map((_, i) => fetch(silbenDatei(wort, i + 1)).then((r) => r.ok)));
      if (da.every(Boolean)) silben.bereit.add(wort);
    } catch { /* offline und nicht im Cache */ }
  }));
  spieleZeigen();
}

const silbenGenug = () => [...new Set(SILBEN_RUNDEN)].every((n) => silbenWoerter(n).length >= 2);

// Nur Standard-Wörter mit Aufnahmen; persönliche Wörter und Hauptwörter mit eigenem Foto/eigener Stimme
// bleiben draußen (dort könnte ein anderes Wort zu sehen oder zu hören sein als die Silben sagen)
function silbenWoerter(anzahl) {
  return BUCHSTABEN.flatMap((e) => woerterFuer(e)).filter((w) => {
    if (w.art === 'eigen' || !SILBEN[w.wort] || !silben.bereit.has(w.wort)) return false;
    if (w.art === 'haupt' && medien[w.b] && (medien[w.b].bildUrl || medien[w.b].stimme)) return false;
    return !anzahl || SILBEN[w.wort].length === anzahl;
  });
}

// Tiefes "Bumm" ohne Datei (weich ansetzen, sonst klickt es)
function bumm(laut = 0.6) {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.25);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(laut, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.32);
}

// Läuft die Runde noch? (Home, neue Runde oder Zurück-Taste machen alte Abläufe ungültig)
const silbenAktuell = (nr) => nr === silben.nummer && $('#silben').classList.contains('active');

function silbenTimerStoppen() {
  clearTimeout(silben.timer);
  clearTimeout(silben.erinnerTimer);
  silben.nummer++;
  silben.phase = 'aus';
}

// Zu zweit trommeln (👫): zwei Trommeln, Geschwister hauen abwechselnd je eine Silbe – zusammen statt gegeneinander.
// Gezählt werden die Schläge beider Trommeln; wer wann haut, wird nicht geprüft.
const trommeln = () => [...document.querySelectorAll('#silben .silben-trommel')].filter((t) => !t.hidden);

// wach = Kind ist dran (volle Farbe, pulsiert bis zum ersten Schlag)
function trommelZustand(wach) {
  trommeln().forEach((t) => {
    t.classList.toggle('wach', wach);
    t.classList.toggle('wartet', wach);
  });
}

// Einmal-Animationen: vorher alle entfernen, sonst überdecken sie sich gegenseitig.
// welche = Nummer der Trommel; ohne Angabe alle
function trommelAnimation(klasse, welche = null) {
  trommeln().filter((_, i) => welche === null || i === welche % trommeln().length).forEach((t) => {
    t.classList.remove('schlag', 'wackeln', 'aufwachen');
    void t.offsetWidth;
    t.classList.add(klasse);
  });
}

function zuZweitSetzen(an) {
  silben.zuZweit = an;
  $('#silben-trommel-2').hidden = !an;
  $('.silben-trommeln').classList.toggle('zwei', an);
  speicher.schreiben('zuZweit', an);
}

const BOGEN_SVG = '<svg viewBox="0 0 72 40"><path d="M6 8 Q36 52 66 8"/></svg>';

function bogenHinzu(reihe, app = false, zweite = false) {
  const b = document.createElement('div');
  b.className = `silben-bogen neu${app ? ' app' : ''}${zweite ? ' zweite' : ''}`;
  b.innerHTML = BOGEN_SVG;
  b.addEventListener('animationend', () => b.classList.remove('neu', 'leuchtet'));
  $(reihe).appendChild(b);
  return b;
}

function boegenLeeren() { $('#silben-boegen').innerHTML = ''; $('#silben-boegen-app').innerHTML = ''; }

function bogenLeuchten(b) {
  b.classList.remove('neu', 'leuchtet');
  void b.offsetWidth;
  b.classList.add('leuchtet');
}

function silbenRundenAnzeigen() {
  $('#silben-runden').innerHTML = SILBEN_RUNDEN.map((_, i) => `<span class="${i < silben.runde ? 'voll' : ''}"></span>`).join('');
}

// Silbe abspielen, ohne auf das Ende zu warten (der Takt bestimmt das Tempo)
function silbeSprechen(nr) {
  const datei = silbenDatei(silben.wahl.wort, nr);
  const eigen = eigeneDatei(datei);
  const a = new Audio(eigen ? URL.createObjectURL(eigen) : datei);
  if (eigen) a.onended = () => URL.revokeObjectURL(a.src);
  wiedergabe.audio = a;
  a.play().catch(() => {});
  return a;
}

// Nach dem Takt höchstens noch kurz warten, bis eine lange Silbe ausgeklungen ist (nicht abschneiden)
async function silbeAusklingen(a) {
  for (let i = 0; i < 8 && !a.ended && !a.paused && !a.error; i++) await warten(50);
}

// Die App trommelt das Wort: jede Silbe mit Bumm, Vibration, Stimme und Bogen.
// boegen = vorhandene Bögen des Kindes (Bestätigen), sonst neue blaue Bögen in der App-Reihe
async function vortrommeln(nr, { boegen = null, takt = SILBEN_TAKT_VOR } = {}) {
  wiedergabeStoppen();   // laufende Ansage (z. B. Erinnerung) nicht unter die Silben mischen
  if (!boegen) $('#silben-boegen-app').innerHTML = '';
  for (let i = 0; i < silben.teile.length; i++) {
    if (!silbenAktuell(nr)) return false;
    const b = boegen ? boegen[i] : bogenHinzu('#silben-boegen-app', true);
    if (b) bogenLeuchten(b);
    trommelAnimation('schlag', i);   // zu zweit: abwechselnd links und rechts
    bumm();
    vibrieren(25);
    const a = silbeSprechen(i + 1);
    await warten(takt);
    await silbeAusklingen(a);
  }
  return silbenAktuell(nr);
}

async function silbenSagen(nr, folge, text) {
  await folgeAbspielen(folge, text);
  return silbenAktuell(nr);
}

function silbenNeueRunde() {
  silbenTimerStoppen();
  let soll = SILBEN_RUNDEN[silben.runde];
  // Nach einer gemeinsamen Runde nicht schwerer werden
  if (silben.zusammenVorher && silben.teile.length && soll > silben.teile.length) soll = silben.teile.length;
  silben.zusammenVorher = false;
  const auswahl = silbenWoerter(soll).filter((w) => !silben.vorher.includes(w.wort));
  silben.wahl = zufall(auswahl.length ? auswahl : silbenWoerter(soll));
  silben.vorher = [...silben.vorher.slice(-4), silben.wahl.wort];
  silben.teile = SILBEN[silben.wahl.wort];
  silben.versuch = 0;
  silben.erinnert = 0;
  silbenRundenAnzeigen();
  $('#silben-bild').innerHTML = silben.wahl.bild();
  $('#silben-bild').setAttribute('aria-label', silben.wahl.wort);
  silbenVorsprechen(silben.runde === 0);
}

// Wort ansagen (in den ersten Runden auch vortrommeln), danach wacht die Trommel auf
async function silbenVorsprechen(mitAnsage) {
  silbenTimerStoppen();
  const nr = silben.nummer;
  boegenLeeren();
  trommelZustand(false);
  silben.phase = 'app';
  const folge = [...(mitAnsage ? [{ url: 'audio/ansage-silben.wav' }] : []), ...silben.wahl.wortAllein()];
  if (!(await silbenSagen(nr, folge, mitAnsage ? `Trommle das Wort! ${silben.wahl.wort}` : silben.wahl.wort))) return;
  if (silben.runde < SILBEN_VORMACHEN) {
    if (!(await silbenSagen(nr, [{ url: 'audio/ansage-silben-hoerzu.wav' }], 'Hör zu!'))) return;
    if (!(await vortrommeln(nr))) return;
    if (!(await silbenSagen(nr, [{ url: 'audio/ansage-silben-jetzt-du.wav' }], 'Jetzt du!'))) return;
  }
  trommelAufwachen(nr);
}

function trommelAufwachen(nr) {
  if (!silbenAktuell(nr)) return;
  silben.phase = 'trommeln';
  silben.schlaege = 0;
  silben.start = 0;
  $('#silben-boegen').innerHTML = '';
  trommelZustand(true);
  trommelAnimation('aufwachen');
  silbenErinnern(nr);
}

// Kind trommelt nicht: einmal erinnern, dann einmal vortrommeln – danach still warten, nie selbst weiterschalten
function silbenErinnern(nr) {
  clearTimeout(silben.erinnerTimer);
  if (silben.erinnert >= 2) return;
  silben.erinnerTimer = setTimeout(async () => {
    if (!silbenAktuell(nr) || silben.phase !== 'trommeln' || silben.schlaege) return;
    silben.erinnert++;
    if (silben.erinnert === 1) {
      trommelAnimation('wackeln');
      if (!(await silbenSagen(nr, [{ url: 'audio/ansage-silben-erinnerung.wav' }, ...silben.wahl.wortAllein()], 'Hau auf die Trommel!'))) return;
      if (silben.phase === 'trommeln' && !silben.schlaege) silbenErinnern(nr);
    } else {
      silben.phase = 'app';
      trommelZustand(false);
      if (!(await vortrommeln(nr))) return;
      if (!(await silbenSagen(nr, [{ url: 'audio/ansage-silben-jetzt-du.wav' }], 'Jetzt du!'))) return;
      trommelAufwachen(nr);
    }
  }, silben.erinnert === 0 ? 6000 : 8000);
}

function trommelGeschlagen(welche = 0) {
  audio();
  if (silben.phase === 'zusammen') { trommelAnimation('schlag', welche); bumm(0.35); vibrieren(25); return; }
  // Noch nicht dran: leise federn, damit die Trommel nicht "kaputt" wirkt, aber nichts zählt
  if (silben.phase !== 'trommeln') { trommelAnimation('schlag', welche); bumm(0.12); return; }
  const jetzt = performance.now();
  if (silben.letzter && jetzt - silben.letzter < SILBEN_ZITTERN) return;
  silben.letzter = jetzt;
  clearTimeout(silben.erinnerTimer);
  trommeln().forEach((t) => t.classList.remove('wartet'));
  trommelAnimation('schlag', welche);
  bumm();
  vibrieren(25);
  if (!silben.start) silben.start = jetzt;
  // Wildes Trommeln darf klingen, aber höchstens Silbenzahl + 2 Bögen (zu zweit: Bogen in der Farbe der Trommel)
  if (silben.schlaege < Math.min(silben.teile.length + 2, 6)) { silben.schlaege++; bogenHinzu('#silben-boegen', false, welche === 1); }
  clearTimeout(silben.timer);
  if (jetzt - silben.start > SILBEN_DAUER_MAX) { silbenAuswerten(); return; }
  silben.timer = setTimeout(silbenAuswerten, SILBEN_FERTIG_NACH);
}

async function silbenAuswerten() {
  clearTimeout(silben.timer);
  const nr = silben.nummer;
  silben.phase = 'app';
  trommelZustand(false);
  if (silben.schlaege === silben.teile.length) {
    // Richtig: die App spricht die Silben zu den Bögen des Kindes, dann Lob
    if (!(await vortrommeln(nr, { boegen: [...document.querySelectorAll('#silben-boegen .silben-bogen')], takt: SILBEN_TAKT_BESTAETIGEN }))) return;
    silbenRundeGeschafft(nr, false);
    return;
  }
  // Kein "falsch": Bögen des Kindes werden blass und bleiben stehen, darüber trommelt die App vor – zum Vergleichen
  document.querySelectorAll('#silben-boegen .silben-bogen').forEach((b) => b.classList.add('blass'));
  await warten(500);
  if (!silbenAktuell(nr)) return;
  if (silben.versuch === 0) {
    silben.versuch = 1;
    if (!(await silbenSagen(nr, [{ url: 'audio/ansage-silben-hoermal.wav' }], 'Hör mal, so geht es.'))) return;
    if (!(await vortrommeln(nr))) return;
    if (!(await silbenSagen(nr, [{ url: 'audio/ansage-silben-jetzt-du.wav' }], 'Jetzt du!'))) return;
    trommelAufwachen(nr);
    return;
  }
  // Zweites Mal daneben: gemeinsam langsam trommeln; der Punkt steht für die erlebte Runde, das Lob ist ein anderes
  if (!(await silbenSagen(nr, [{ url: 'audio/ansage-silben-zusammen.wav' }], 'Wir trommeln zusammen!'))) return;
  $('#silben-boegen').innerHTML = '';
  silben.phase = 'zusammen';
  trommelZustand(true);
  trommeln().forEach((t) => t.classList.remove('wartet'));
  if (!(await vortrommeln(nr, { takt: SILBEN_TAKT_ZUSAMMEN }))) return;
  silben.phase = 'app';
  trommelZustand(false);
  silben.zusammenVorher = true;
  silbenRundeGeschafft(nr, true);
}

async function silbenRundeGeschafft(nr, zusammen) {
  silben.runde++;
  silbenRundenAnzeigen();
  if (!zusammen) glockenspiel();
  await warten(300);
  const folge = zusammen ? [{ url: 'audio/ansage-silben-zusammen-geschafft.wav' }, ...silben.wahl.wortAllein()]
    : [...lobMitName(silben.wahl.b), ...silben.wahl.wortAllein()];
  if (!(await silbenSagen(nr, folge, zusammen ? 'Zusammen geschafft!' : `Super! ${silben.wahl.wort}`))) return;
  silben.timer = setTimeout(() => {
    if (!silbenAktuell(nr)) return;
    if (silben.runde >= SILBEN_RUNDEN.length) silbenGeschafft(); else silbenNeueRunde();
  }, 900);
}

function silbenGeschafft() {
  const jubel = $('#silben-jubel');
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  glockenspiel();
  folgeAbspielen([{ url: 'audio/ansage-runde-geschafft.wav' }], 'Alles geschafft!');
  silben.timer = setTimeout(() => spielEnde('silben', () => { silben.runde = 0; silbenNeueRunde(); }), 2200);
}

function silbenStarten() {
  zuZweitSetzen(speicher.lesen('zuZweit', false));
  silben.runde = 0;
  silben.teile = [];
  silben.zusammenVorher = false;
  spielEndeWeg('silben');
  zeigen('silben');
  silbenNeueRunde();
}

['#silben-trommel', '#silben-trommel-2'].forEach((sel, i) => {
  $(sel).addEventListener('pointerdown', (e) => { e.preventDefault(); trommelGeschlagen(i); });
  $(sel).addEventListener('contextmenu', (e) => e.preventDefault());
});
// 👫 stellen die Eltern ein (Kinder sollen nicht aus Versehen umschalten)
$('#zu-zweit').addEventListener('change', (e) => zuZweitSetzen(e.target.checked));
$('#btn-silben-home').addEventListener('click', () => { silbenTimerStoppen(); wiedergabeStoppen(); zurStartseite(); });
// Wort nochmal hören: laufender Versuch beginnt von vorn (nicht, während die App selbst spricht oder trommelt)
const silbenWortNochmal = () => { if (silben.phase === 'trommeln') { audio(); silbenVorsprechen(false); } };
$('#btn-silben-wort').addEventListener('click', silbenWortNochmal);
$('#silben-bild').addEventListener('click', silbenWortNochmal);
// App im Hintergrund: keine Erinnerung ins Leere; zurück: wieder freundlich warten
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(silben.erinnerTimer);
  else if (silben.phase === 'trommeln' && !silben.schlaege && silbenAktuell(silben.nummer)) silbenErinnern(silben.nummer);
});
silbenPruefen();

// Spiele-Leiste
function buchstabenZeigen() {
  spurBesuch.geschafft = 0;
  rasterZeichnen();
  zeigen('buchstaben');
}
$('#btn-buchstaben-home').addEventListener('click', zurStartseite);

const SPIELE = { spuren: buchstabenZeigen, zeigen: zeigenStarten, kiste: kisteStarten, reime: reimStarten, hoeren: hoerSpielStarten, silben: silbenStarten, name: nameStarten, memory: memoryStarten, jagd: jagdStarten, legen: legenStarten, album: albumOeffnen };
document.querySelectorAll('.spiel-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio();
    const start = SPIELE[btn.dataset.spiel];
    if (start) start();
  });
});

// ---------- Sichern & Übertragen (Export/Import als eine JSON-Datei) ----------

const SICHERUNG_FORMAT = 'buchstaben-sicherung';
const SICHERUNG_VERSION = 1;

const blobZuText = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);   // data:...;base64,...
  r.onerror = reject;
  r.readAsDataURL(blob);
});
// Nur eingebettete Bilder/Töne annehmen – eine manipulierte Sicherung darf keine fremde Adresse abrufen lassen.
// Typ z. B. "audio/ogg; codecs=opus" (Firefox, mit Leerzeichen) oder ohne Typ "application/octet-stream".
// Ungültiges ergibt null und wird beim Einspielen übersprungen (nicht alles abbrechen).
// Nur Fotos (JPEG/PNG/WebP/GIF) und Töne (Audio, auch WebM/MP4-Aufnahmen); kein SVG/HTML, das Code enthalten könnte
const DATEN_URL = /^data:(image\/(jpeg|png|webp|gif)|audio\/[\w.+-]+|video\/(webm|mp4)|application\/octet-stream)?(;\s*[\w.+-]+=[\w."+-]+)*;base64,[A-Za-z0-9+/=]*$/;
const MEDIUM_HOECHSTENS = 15e6;          // Zeichen je eingebettetem Foto/Ton (≈ 11 MB)
const SICHERUNG_HOECHSTENS = 300e6;      // Bytes der ganzen Datei
const textZuBlob = async (daten) => {
  if (typeof daten !== 'string' || daten.length > MEDIUM_HOECHSTENS || !DATEN_URL.test(daten)) return null;
  try { return await (await fetch(daten)).blob(); } catch { return null; }
};

// Erlaubte Medien-Schlüssel eines Profils: Buchstabe, eigenes Wort, Lob-Platz oder Studio-Datei; Art bild/stimme
const MEDIEN_SCHLUESSEL = /^[^|]+\|([a-zäöüß]|w-[\w-]+|lob-[1-9]|ich|datei:[a-z0-9-]+\.wav)\|(bild|stimme)$/;

// Alles Eigene einsammeln: Profile mit Medien, Kinder mit Foto/Namensaufnahme, App-weite Einstellungen
// nurStimme: nur die eigenen Profile (Stimme, Fotos, eigene Wörter) – ohne Kinder, Namen, Sterne und Funde,
// z. B. um die eigene Stimme an Großeltern weiterzugeben
async function sicherungErstellen(nurStimme = false) {
  const medienAlle = await datenbank.alleMedien();
  const profile = [];
  for (const p of await datenbank.profile()) {
    const medien = [];
    for (const m of medienAlle.filter((x) => x.schluessel.startsWith(`${p.id}|`))) {
      medien.push({ schluessel: m.schluessel, daten: await blobZuText(m.blob) });
    }
    profile.push({ ...p, medien });
  }
  const kinderListe = [];
  for (const k of nurStimme ? [] : await datenbank.kinder()) {
    kinderListe.push({
      ...k,
      foto: k.foto ? await blobZuText(k.foto) : null,
      nameStimme: k.nameStimme ? await blobZuText(k.nameStimme) : null,
    });
  }
  return {
    format: SICHERUNG_FORMAT,
    version: SICHERUNG_VERSION,
    erstellt: new Date().toISOString(),
    ...(nurStimme ? { nurStimme: true } : {}),
    einstellungen: nurStimme ? undefined : {
      schreibweise: speicher.lesen('schreibweise', 'klein'),
      sterne: speicher.lesen('sterne', {}),
      profil: speicher.lesen('profil', STANDARD.id),
      album: speicher.lesen('album', []),
      reihenfolge: speicher.lesen('reihenfolge', 'alphabet'),
      farbe: speicher.lesen('farbe', 'bunt'),
      reimHoeren: speicher.lesen('reimHoeren', false),
      spieleAus: appWeitAus(),
      funde: speicher.lesen('funde', []),
    },
    profile,
    kinder: kinderListe,
    funde: nurStimme ? [] : await Promise.all(medienAlle.filter((m) => m.schluessel.startsWith('fund-'))
      .map(async (m) => ({ schluessel: m.schluessel, daten: await blobZuText(m.blob) }))),
  };
}

// Einspielen: Profile und Kinder aus der Datei kommen dazu bzw. ersetzen die mit gleicher ID.
// Was es nur auf diesem Gerät gibt, bleibt unangetastet.
// Eingespielte Daten nie roh übernehmen: nur bekannte Felder mit erlaubten Werten (eine manipulierte Datei
// könnte sonst z. B. Code in Namen oder Tier-Feldern einschleusen, der dann in der App liefe)
const textFeld = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');
const ausListe = (x, liste, standard) => (liste.includes(x) ? x : standard);
const zahlen = (o, schluessel) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {})
  .filter(([k, v]) => schluessel(k) && Number.isFinite(v)).map(([k, v]) => [k, Math.max(0, Math.min(MAX_STERNE, Math.round(v)))]));
const istBuchstabe = (b) => BUCHSTABEN.some((e) => e.b === b);
const stringListe = (x, muster, max = 500) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string' && muster.test(v)).slice(0, max) : []);
function fundeSauber(liste) {
  return (Array.isArray(liste) ? liste : []).filter((f) => f && typeof f.id === 'string' && /^[a-z0-9]+$/.test(f.id)).slice(0, 2000)
    .map((f) => (f.art === 'erzaehlung'
      ? { id: f.id, art: 'erzaehlung', kiste: ausListe(f.kiste, [...KISTEN, ...EIGENE_KISTEN].map((k) => k.id), KISTEN[0].id),
        woerter: stringListe(f.woerter, /^[a-z0-9]+$/, 6), zeit: Number(f.zeit) || 0 }
      : { id: f.id, b: istBuchstabe(f.b) ? f.b : BUCHSTABEN[0].b, zeit: Number(f.zeit) || 0 }));
}
const ALBUM_MUSTER = /^[a-zäöüß]\|[^<>"&|]{1,40}$/;
function kindSauber(k) {
  return {
    id: k.id, name: textFeld(k.name, 20).trim() || 'Kind', tier: ausListe(k.tier, TIERE, TIERE[0]),
    schreibweise: ausListe(k.schreibweise, ['klein', 'gross'], 'klein'), reihenfolge: ausListe(k.reihenfolge, ['alphabet', 'montessori'], 'alphabet'),
    farbe: ausListe(k.farbe, FARB_AUSWAHL, 'bunt'),
    profil: typeof k.profil === 'string' && (k.profil === STANDARD.id || /^p-[a-z0-9-]+$/.test(k.profil)) ? k.profil : STANDARD.id,
    sterne: zahlen(k.sterne, istBuchstabe), album: stringListe(k.album, ALBUM_MUSTER, 2000), funde: fundeSauber(k.funde),
    ...(Array.isArray(k.spieleAus) ? { spieleAus: k.spieleAus.filter((id) => ALLE_SPIELE.includes(id)) } : {}),
    ...(Array.isArray(k.spiele) ? { spiele: k.spiele.filter((id) => ALLE_SPIELE.includes(id)) } : {}),
    reimHoeren: !!k.reimHoeren, erstellt: Number(k.erstellt) || Date.now(),
    lobGaeste: stringListe(k.lobGaeste, /^p-[a-z0-9-]+$/, 10),
  };
}
function profilSauber(p) {
  const woerter = (Array.isArray(p.woerter) ? p.woerter : [])
    .filter((w) => w && typeof w.id === 'string' && /^[a-z0-9]+$/.test(w.id) && istBuchstabe(w.b) && typeof w.wort === 'string')
    .map((w) => ({ id: w.id, b: w.b, wort: w.wort.slice(0, 30) })).slice(0, 500);
  const kistenWoerter = (Array.isArray(p.kistenWoerter) ? p.kistenWoerter : [])
    .filter((w) => w && typeof w.id === 'string' && /^[a-z0-9]+$/.test(w.id) && EIGENE_KISTEN.some((k) => k.id === w.kiste) && typeof w.wort === 'string')
    .map((w) => ({ id: w.id, kiste: w.kiste, wort: w.wort.slice(0, 30), ...(w.name === true ? { name: true } : {}) })).slice(0, EIGENE_KISTEN.length * KISTE_MAX);
  return { id: p.id, name: textFeld(p.name, 30).trim() || 'Profil', erstellt: Number(p.erstellt) || Date.now(), woerter, kistenWoerter };
}

async function sicherungEinspielen(s) {
  if (!s || s.format !== SICHERUNG_FORMAT || !Array.isArray(s.profile) || !Array.isArray(s.kinder)) {
    throw new Error('Das ist keine Sicherung dieser App.');
  }
  if (s.version > SICHERUNG_VERSION) throw new Error('Die Sicherung stammt aus einer neueren App-Version. Bitte die App aktualisieren.');
  const warFrisch = kinder.length === 0 && (await datenbank.profile()).length === 0;
  let uebersprungen = 0;
  const blobOderNull = async (daten) => {
    const blob = daten ? await textZuBlob(daten) : null;
    if (daten && !blob) uebersprungen++;
    return blob;
  };
  for (const { medien: medienListe, ...profil } of s.profile) {
    // Nur echte Profil-IDs (sonst könnte eine manipulierte Datei z. B. die Funde eines Kindes löschen)
    if (typeof profil.id !== 'string' || !/^p-[a-z0-9-]+$/.test(profil.id) || !profil.name) { uebersprungen++; continue; }
    // Erst alles prüfen und umwandeln, dann die alten Medien ersetzen – so geht bei Fehlern nichts verloren
    const neu = [];
    for (const m of medienListe || []) {
      if (typeof m.schluessel !== 'string' || !m.schluessel.startsWith(`${profil.id}|`) || !MEDIEN_SCHLUESSEL.test(m.schluessel)) { uebersprungen++; continue; }
      const blob = await blobOderNull(m.daten);
      if (blob) neu.push([m.schluessel, blob]);
    }
    await datenbank.profilLoeschen(profil.id);
    await datenbank.profilSpeichern(profilSauber(profil));
    for (const [schluessel, blob] of neu) await datenbank.medienRoh(schluessel, blob);
  }
  for (const k of s.kinder) {
    if (!k || typeof k.id !== 'string' || !/^k-[a-z0-9-]+$/.test(k.id) || !k.name) { uebersprungen++; continue; }
    await datenbank.kindSpeichern({
      ...kindSauber(k),
      foto: await blobOderNull(k.foto),
      nameStimme: await blobOderNull(k.nameStimme),
    });
  }
  for (const f of s.funde || []) {
    if (typeof f.schluessel !== 'string' || !/^fund-[^|]+\|[^|]+\|[^|]+$/.test(f.schluessel)) { uebersprungen++; continue; }
    const blob = await blobOderNull(f.daten);
    if (blob) await datenbank.medienRoh(f.schluessel, blob);
  }
  // App-weite Einstellungen nur auf einem frischen Gerät übernehmen (sonst nichts überschreiben)
  if (warFrisch && s.einstellungen) {
    const e = kindSauber({ ...s.einstellungen, id: 'k-einstellungen', name: 'x' });
    speicher.schreiben('funde', e.funde);
    speicher.schreiben('schreibweise', e.schreibweise);
    speicher.schreiben('sterne', e.sterne);
    speicher.schreiben('profil', e.profil);
    speicher.schreiben('album', e.album);
    speicher.schreiben('reihenfolge', e.reihenfolge);
    speicher.schreiben('farbe', e.farbe);
    speicher.schreiben('reimHoeren', !!s.einstellungen.reimHoeren);
    speicher.schreiben('spieleAus', regalAus(s.einstellungen) || []);
  }
  await kinderLaden();
  if (!aktivesKind() && kinder.length) { zustand.kind = kinder[0].id; speicher.schreiben('kind', zustand.kind); }
  einstellungenLaden();
  if (zustand.profil !== STANDARD.id && !(await datenbank.profile()).some((p) => p.id === zustand.profil)) {
    zustand.profil = STANDARD.id;
  }
  await medienLaden();
  return { profile: s.profile.length, kinder: s.kinder.length, uebersprungen };
}

function sicherungDateiname() {
  return `buchstaben-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
}

async function sicherungAlsDatei(nurStimme = false) {
  const daten = await sicherungErstellen(nurStimme);
  const name = nurStimme ? sicherungDateiname().replace('sicherung', 'stimme') : sicherungDateiname();
  return new File([JSON.stringify(daten)], name, { type: 'application/json' });
}

const SICHERUNG_ERINNERN_TAGE = 30;

function sicherungZusammenfassung() {
  const box = $('#sicherung-info');
  datenbank.profile().then((profile) => {
    box.textContent = `Auf diesem Gerät: ${profile.length} eigene${profile.length === 1 ? 's Profil' : ' Profile'}, `
      + `${kinder.length} ${kinder.length === 1 ? 'Kind' : 'Kinder'}.`;
    // Wann zuletzt gesichert wurde – ohne Sicherung ist bei Verlust des Handys alles weg
    const zuletzt = speicher.lesen('letzteSicherung', null);
    const tage = zuletzt ? Math.floor((Date.now() - zuletzt) / 864e5) : null;
    const hinweis = $('#sicherung-erinnerung');
    hinweis.textContent = zuletzt
      ? `Letzte Sicherung: ${tage === 0 ? 'heute' : tage === 1 ? 'gestern' : `vor ${tage} Tagen`}.`
      : 'Noch keine Sicherung gemacht.';
    const faellig = (kinder.length || profile.length) && (tage === null || tage > SICHERUNG_ERINNERN_TAGE);
    if (faellig) hinweis.textContent += ' Zeit für eine Sicherung – sonst sind Fotos und Aufnahmen weg, wenn das Handy verloren geht.';
    hinweis.classList.toggle('warnung', !!faellig);
    // Wie viel Platz Fotos und Aufnahmen belegen (damit „Speicher voll“ nicht überrascht)
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(({ usage }) => {
        if (usage) box.textContent += ` Belegt: etwa ${Math.max(1, Math.round(usage / 1e6))} MB.`;
      }).catch(() => {});
    }
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((ja) => { box.textContent += ja ? ' Vom Browser geschützt.' : ''; }).catch(() => {});
    }
  });
}

async function sicherungHerunterladen(knopf, nurStimme) {
  knopf.disabled = true;
  try {
    const datei = await sicherungAlsDatei(nurStimme);
    const url = URL.createObjectURL(datei);
    const a = document.createElement('a');
    a.href = url;
    a.download = datei.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    if (!nurStimme) { speicher.schreiben('letzteSicherung', Date.now()); sicherungZusammenfassung(); }
  } catch {
    alert('Die Sicherung konnte nicht erstellt werden.');
  } finally {
    knopf.disabled = false;
  }
}
$('#btn-sichern').addEventListener('click', (e) => sicherungHerunterladen(e.currentTarget, false));
$('#btn-sichern-stimme').addEventListener('click', (e) => sicherungHerunterladen(e.currentTarget, true));

$('#btn-teilen').addEventListener('click', async (e) => {
  const knopf = e.currentTarget;
  knopf.disabled = true;
  try {
    if (!confirm('Die Sicherung enthält Namen, Fotos und Stimmen Ihrer Kinder – und die Fotos und Stimmen aus Ihren eigenen Kisten (z. B. Oma, Erzieherin).\n'
      + 'Nur an sich selbst oder Ihren Partner schicken – im Einzelchat, nicht in Gruppen – und danach im Chat löschen.')) return;
    const datei = await sicherungAlsDatei();
    await navigator.share({ files: [datei], title: 'Wortnest-Sicherung' });
    speicher.schreiben('letzteSicherung', Date.now());
    sicherungZusammenfassung();
  } catch (fehler) {
    if (fehler && fehler.name !== 'AbortError') alert('Teilen hat nicht geklappt. Bitte „Sicherung speichern“ verwenden.');
  } finally {
    knopf.disabled = false;
  }
});

$('#btn-einspielen').addEventListener('click', () => {
  const input = $('#sicherung-input');
  input.value = '';
  input.click();
});

$('#sicherung-input').addEventListener('change', async (e) => {
  const datei = e.target.files && e.target.files[0];
  if (!datei) return;
  try {
    if (datei.size > SICHERUNG_HOECHSTENS) throw new Error('Die Datei ist zu groß für eine Sicherung dieser App.');
    const inhalt = JSON.parse(await datei.text());
    // Stimm-Paket (Mitmachen) statt Sicherung: erst ansehen und anhören
    if (inhalt && inhalt.format === PAKET_FORMAT) {
      if (datei.size > PAKET_HOECHSTENS) throw new Error('Das Stimm-Paket ist zu groß.');
      await paketOeffnen(inhalt);
      return;
    }
    const anzahl = { profile: (inhalt.profile || []).length, kinder: (inhalt.kinder || []).length };
    if (!confirm(`Sicherung einspielen: ${anzahl.profile} Profil(e) und ${anzahl.kinder} Kind(er).\n`
      + 'Gleiche Profile/Kinder werden aktualisiert, alles andere bleibt erhalten.')) return;
    const ergebnis = await sicherungEinspielen(inhalt);
    await elternOeffnen();
    alert(`Fertig: ${ergebnis.profile} Profil(e) und ${ergebnis.kinder} Kind(er) übernommen.`
      + (ergebnis.uebersprungen ? `\n${ergebnis.uebersprungen} beschädigte Einträge wurden übersprungen.` : ''));
  } catch (fehler) {
    alert(fehler instanceof SyntaxError ? 'Die Datei ist keine gültige Sicherung.' : (fehler.message || 'Einspielen fehlgeschlagen.'));
  }
});

// ---------- Mitmachen von außen: Oma, Erzieherin … nimmt auf dem eigenen Handy auf und schickt ein Stimm-Paket ----------
// Ohne Server: Einladung = Link (#mitmachen=<Name>), Rückweg = JSON-Datei per Messenger. Auf dem Handy der eingeladenen
// Person wird nichts gespeichert (nur im Speicher, bis die Seite zu ist); die Familie hört alles an, bevor es übernommen wird.
const PAKET_FORMAT = 'buchstaben-stimmpaket';
const PAKET_VERSION = 1;
const PAKET_HOECHSTENS = 20e6;
const einladungsLink = (name) => `${location.origin}${location.pathname}#mitmachen=${encodeURIComponent(name)}`;
// Name aus Link oder Paket: ohne Steuer- und Richtungszeichen (die z. B. „Von …“ in der Vorschau verdrehen könnten)
const nameSauber = (x) => textFeld(x, 30).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
function mitmachName(hash) {
  const m = /^#mitmachen(?:=(.*))?$/.exec(hash || '');
  if (!m) return null;
  try { return nameSauber(decodeURIComponent(m[1] || '')); } catch { return ''; }
}
// Link im selben Tab eingefügt (nur der Hash ändert sich): neu laden, damit die richtige Seite erscheint
let mitmachBeimStart = null;
window.addEventListener('hashchange', () => {
  if ((mitmachName(location.hash) !== null) !== (mitmachBeimStart !== null)) location.reload();
});

$('#btn-einladen').addEventListener('click', async () => {
  const name = (prompt('Wen möchten Sie einladen? Name, wie die Kinder ihn sagen (z. B. Oma):') || '').trim().slice(0, 30);
  if (!name) return;
  const link = einladungsLink(name);
  const text = `Hallo ${name}! Magst du für die Kinder ein paar Lob-Sätze aufnehmen? Link öffnen, aufnehmen und das Paket `
    + 'zurückschicken. Bis du es schickst, bleibt alles auf deinem Handy.';
  if (navigator.share) {
    try { await navigator.share({ title: 'Wortnest: Mitmachen', text, url: link }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text}\n${link}`); alert(`Der Link ist kopiert – im Chat einfügen:\n\n${link}`); } catch { prompt('Diesen Link schicken:', link); }
});

const mitmach = { foto: null, fotoUrl: null, nameStimme: null, lob: [], verschickt: false };
const mitmachHatInhalt = () => !!(mitmach.nameStimme || mitmach.foto || mitmach.lob.some(Boolean));
// Aufnahmen liegen nur im Speicher: vor Neuladen/Schließen warnen, solange etwas nicht verschickt ist
window.addEventListener('beforeunload', (e) => {
  if (!$('#mitmachen').classList.contains('active') || !mitmachHatInhalt() || mitmach.verschickt) return;
  e.preventDefault();
  e.returnValue = '';
});

// Aufnehmen mit deutlicher Rückmeldung: großes „Ich höre zu …“ mit 5-Sekunden-Balken, danach einmal vorspielen
function mitmachAufnehmen(knopf, setzen) {
  const hoert = $('#mitmachen-hoert');
  const weg = () => { hoert.hidden = true; };
  if (rekorder && rekorder.state === 'recording') { stopAufnahme(); return; }
  aufnehmen(knopf, (blob) => {
    weg();
    setzen(blob);
    mitmach.verschickt = false;
    mitmachZeichnen();
    folgeAbspielen([blobQuelle(blob)]);
  });
  // Erst zeigen, wenn wirklich aufgenommen wird (nach der Mikrofon-Frage)
  const start = performance.now();
  const pruefen = () => {
    if (rekorder && rekorder.state === 'recording') {
      hoert.hidden = false;
      hoert.classList.remove('laeuft'); void hoert.offsetWidth; hoert.classList.add('laeuft');
      setTimeout(weg, 5300);
    } else if (performance.now() - start < 15000) setTimeout(pruefen, 100);
  };
  pruefen();
}

function mitmachenStarten(name) {
  $('#mitmachen-gruss').textContent = name ? `Hallo ${name}!` : 'Hallo!';
  $('#mitmachen-name').value = name || '';
  mitmachZeichnen();
  zeigen('mitmachen', false);
}

function mitmachZeichnen() {
  $('#mitmachen-foto').innerHTML = mitmach.fotoUrl ? `<img src="${mitmach.fotoUrl}" alt="">` : '🙂';
  $('#btn-mitmachen-name-play').disabled = !mitmach.nameStimme;
  $('#mitmachen-name-status').innerHTML = mitmach.nameStimme ? '<b>✓ aufgenommen</b>' : 'noch nicht aufgenommen';
  const box = $('#mitmachen-lob');
  box.innerHTML = '';
  LOB_SAETZE.forEach((vorschlag, i) => {
    const zeile = document.createElement('div');
    zeile.className = 'lob-zeile';
    const hat = !!mitmach.lob[i];
    zeile.innerHTML = `<span class="w">Satz ${i + 1}<br><small>${hat ? '<b>✓ aufgenommen</b>' : `z. B. „${vorschlag}“`}</small></span>`
      + '<button class="mini-btn" data-a="rec" aria-label="Aufnehmen">🎙️</button>'
      + `<button class="mini-btn" data-a="play" aria-label="Anhören" ${hat ? '' : 'disabled'}>▶️</button>`;
    // Kein Löschen-Knopf: nochmal 🎙️ ersetzt die Aufnahme (weniger Gefahr, aus Versehen zu löschen)
    zeile.querySelector('[data-a=rec]').addEventListener('click', (e) => mitmachAufnehmen(e.currentTarget, (blob) => { mitmach.lob[i] = blob; }));
    zeile.querySelector('[data-a=play]').addEventListener('click', () => folgeAbspielen([blobQuelle(mitmach.lob[i])]));
    box.appendChild(zeile);
  });
  const lob = mitmach.lob.filter(Boolean).length;
  $('#mitmachen-stand').textContent = lob
    ? `Im Paket: ${lob} Lob-Satz/Sätze${mitmach.nameStimme ? ', Ihr Name' : ''}${mitmach.foto ? ', Ihr Foto' : ''}.`
    : 'Bitte mindestens einen Lob-Satz aufnehmen.';
  $('#btn-mitmachen-schicken').disabled = !lob;
  $('#btn-mitmachen-schicken').textContent = mitmach.verschickt ? '📤 Nochmal schicken' : '📤 Paket schicken';
  $('#mitmachen-danke').hidden = !mitmach.verschickt;
}

$('#btn-mitmachen-foto').addEventListener('click', () => fotoWaehlen((blob) => {
  if (mitmach.fotoUrl) URL.revokeObjectURL(mitmach.fotoUrl);
  mitmach.foto = blob;
  mitmach.fotoUrl = URL.createObjectURL(blob);
  mitmachZeichnen();
}));
$('#btn-mitmachen-name-rec').addEventListener('click', (e) => mitmachAufnehmen(e.currentTarget, (blob) => { mitmach.nameStimme = blob; }));
$('#btn-mitmachen-name-play').addEventListener('click', () => mitmach.nameStimme && folgeAbspielen([blobQuelle(mitmach.nameStimme)]));

// Das Paket enthält nur, was die Person selbst aufgenommen hat – keine Daten der Familie
async function paketErstellen() {
  return {
    format: PAKET_FORMAT, version: PAKET_VERSION, erstellt: new Date().toISOString(),
    name: nameSauber($('#mitmachen-name').value) || 'Gast',
    foto: mitmach.foto ? await blobZuText(mitmach.foto) : null,
    nameStimme: mitmach.nameStimme ? await blobZuText(mitmach.nameStimme) : null,
    lob: await Promise.all(mitmach.lob.filter(Boolean).map(blobZuText)),
  };
}

$('#btn-mitmachen-schicken').addEventListener('click', async (e) => {
  const knopf = e.currentTarget;
  knopf.disabled = true;
  try {
    const inhalt = await paketErstellen();
    const datei = new File([JSON.stringify(inhalt)], `stimmpaket-${inhalt.name.replace(/[^\wäöüÄÖÜß-]+/g, '-').slice(0, 20) || 'gast'}.json`, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [datei] })) {
      try {
        await navigator.share({ files: [datei], title: 'Stimm-Paket' });
        mitmach.verschickt = true;
        mitmachZeichnen();
        return;
      } catch (f) { if (f && f.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(datei);
    const a = document.createElement('a');
    a.href = url;
    a.download = datei.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    mitmach.verschickt = true;
    mitmachZeichnen();
    alert('Die Datei ist unter „Downloads“ gespeichert. Bitte schicken Sie sie der Familie: im Chat auf 📎 (Anhang) → '
      + '„Dokument“ tippen und die Datei „stimmpaket-…“ wählen. Danach die Datei in „Downloads“ löschen.');
  } finally {
    knopf.disabled = false;
  }
});

// Stimm-Paket öffnen: nie roh übernehmen – nur Bilder als Foto, nur Töne als Aufnahmen, Name als Text
const istTon = (b) => b && (/^audio\//.test(b.type) || /^video\/(webm|mp4)/.test(b.type) || b.type === 'application/octet-stream' || !b.type);
let paket = null;
async function paketPruefen(inhalt) {
  if (!inhalt || inhalt.format !== PAKET_FORMAT) throw new Error('Das ist kein Stimm-Paket dieser App.');
  if (inhalt.version > PAKET_VERSION) throw new Error('Das Paket stammt aus einer neueren App-Version. Bitte die App aktualisieren.');
  const foto = await textZuBlob(inhalt.foto);
  const nameStimme = await textZuBlob(inhalt.nameStimme);
  const lob = [];
  for (const d of (Array.isArray(inhalt.lob) ? inhalt.lob : []).slice(0, LOB_PLAETZE.length)) {
    const b = await textZuBlob(d);
    if (istTon(b)) lob.push(b);
  }
  const ergebnis = { name: nameSauber(inhalt.name) || 'Gast', foto: foto && /^image\//.test(foto.type) ? foto : null,
    nameStimme: istTon(nameStimme) ? nameStimme : null, lob };
  if (!ergebnis.lob.length && !ergebnis.nameStimme) throw new Error('In diesem Paket ist keine Aufnahme.');
  return ergebnis;
}

function paketWeg() {
  if (paket && paket.fotoUrl) URL.revokeObjectURL(paket.fotoUrl);
  paket = null;
}

async function paketOeffnen(inhalt) {
  const neu = await paketPruefen(inhalt);
  paketWeg();
  paket = neu;
  paket.fotoUrl = paket.foto ? URL.createObjectURL(paket.foto) : null;
  $('#paket-name').textContent = `Von ${paket.name}`;
  $('#paket-foto').innerHTML = paket.fotoUrl ? `<img src="${paket.fotoUrl}" alt="">` : '🙂';
  const teile = $('#paket-teile');
  teile.innerHTML = '';
  [...(paket.nameStimme ? [['Name', paket.nameStimme]] : []), ...paket.lob.map((b, i) => [`Lob ${i + 1}`, b])].forEach(([titel, blob]) => {
    const zeile = document.createElement('div');
    zeile.className = 'lob-zeile';
    zeile.innerHTML = `<span class="w">${titel}</span><button class="mini-btn" aria-label="Anhören">▶️</button>`;
    zeile.querySelector('button').addEventListener('click', () => folgeAbspielen([blobQuelle(blob)]));
    teile.appendChild(zeile);
  });
  zeigen('paket');
}

// Übernehmen: neuer Mensch mit eigener ID – oder, gibt es den Namen schon, auf Wunsch dessen Aufnahmen ersetzen.
// Kinder nur nach Rückfrage; nie wird etwas anderes überschrieben
async function paketUebernehmen() {
  if (!paket) return;
  const p = paket;
  paket = null;
  try {
    const jetzt = Date.now().toString(36);
    const gleich = (await datenbank.profile()).find((x) => x.name.trim().toLowerCase() === p.name.toLowerCase());
    const ersetzen = gleich && confirm(`„${p.name}“ gibt es schon. Die Aufnahmen und das Foto dort durch die neuen ersetzen?\n\n`
      + 'Abbrechen = als neuer Mensch anlegen.');
    const profil = ersetzen ? gleich : { id: `p-${jetzt}`, name: p.name, erstellt: Date.now(), woerter: [], kistenWoerter: [] };
    const id = profil.id;
    // Erst die Medien schreiben, dann das Profil – scheitert etwas (Speicher voll), bleibt kein halber Mensch übrig
    if (ersetzen && p.lob.length) for (const platz of LOB_PLAETZE) await datenbank.medienEntfernen(id, platz, 'stimme');
    for (const [i, blob] of p.lob.entries()) await datenbank.medienSetzen(id, LOB_PLAETZE[i], 'stimme', blob);
    if (p.foto) await datenbank.medienSetzen(id, 'ich', 'bild', p.foto);
    if (p.nameStimme) {
      const leute = (profil.kistenWoerter || []).find((w) => w.kiste === 'leute' && w.wort.trim().toLowerCase() === p.name.toLowerCase());
      const wortId = leute ? leute.id : `${jetzt}n`;
      if (!leute) profil.kistenWoerter = [...(profil.kistenWoerter || []), { id: wortId, kiste: 'leute', wort: p.name, name: true }];
      await datenbank.medienSetzen(id, `w-${wortId}`, 'stimme', p.nameStimme);
      if (p.foto) await datenbank.medienSetzen(id, `w-${wortId}`, 'bild', p.foto);
    }
    await datenbank.profilSpeichern(profil);
    if (p.fotoUrl) URL.revokeObjectURL(p.fotoUrl);
    speicherSchuetzen();
    const b = anfangsBuchstabe(p.name);
    const hinweise = [`${p.name} ist jetzt dabei${p.nameStimme ? ' – auch in „Meine Leute“ und bei ✍️ „Mein Name“ (dort abschaltbar)' : ''}.`];
    if (p.lob.length && b && kinder.length) {
      for (const k of kinder) {
        if ((k.lobGaeste || []).includes(id) || k.profil === id) continue;
        if (!confirm(`Soll ${p.name} ${k.name} ab und zu loben (beim „${b.toUpperCase()}“)?`)) continue;
        k.lobGaeste = [...new Set([...(k.lobGaeste || []), id])].slice(-10);
        await datenbank.kindSpeichern(k);
      }
      await kinderLaden();
    } else if (p.lob.length && !b) hinweise.push('Der Name beginnt nicht mit einem Buchstaben der App – das Lob kommt erst, wenn Sie den Menschen umbenennen.');
    else if (p.lob.length) hinweise.push('Das Lob hört Ihr Kind, sobald Sie ein Kind anlegen und dort „Lob ab und zu auch von …“ anhaken.');
    // Mit Kindern den Menschen zum Bearbeiten markieren (ohne Kinder hieße das: die ganze App hört ihn)
    if (kinder.length) await profilAktivieren(id);
    else await medienLaden();
    if ($('#paket').classList.contains('active')) history.back();
    alert(hinweise.join('\n\n'));
  } catch {
    alert('Das Übernehmen hat nicht geklappt (vielleicht ist der Speicher voll). Bitte später nochmal versuchen.');
    if ($('#paket').classList.contains('active')) history.back();
  }
}

$('#btn-paket-ok').addEventListener('click', paketUebernehmen);
$('#btn-paket-weg').addEventListener('click', () => { paketWeg(); history.back(); });
$('#btn-paket-zurueck').addEventListener('click', () => { paketWeg(); history.back(); });
$('#btn-paket-oeffnen').addEventListener('click', () => { const input = $('#sicherung-input'); input.value = ''; input.click(); });

// ---------- Über die App & Datenschutz (für Eltern; erreichbar aus dem Elternbereich und der Begrüßung) ----------

let infoVonBegruessung = false;
function infoOeffnen() {
  infoVonBegruessung = $('#willkommen').classList.contains('active');
  $('#info-version').textContent = `Version ${APP_VERSION}`;
  zeigen('info');
}
$('#btn-info').addEventListener('click', infoOeffnen);
$('#btn-willkommen-info').addEventListener('click', infoOeffnen);
$('#btn-info-zurueck').addEventListener('click', () => history.back());

// ---------- Willkommen (erster Start) ----------

// Nur auf einem wirklich neuen Gerät: keine Kinder, keine Profile, noch nie gespielt, noch nicht gesehen
async function willkommenNoetig() {
  return !kinder.length && neuesGeraet() && !speicher.lesen('willkommen', false) && !(await datenbank.profile()).length;
}

$('#btn-willkommen-los').addEventListener('click', () => {
  speicher.schreiben('willkommen', true);
  audio();
  rasterZeichnen();
  zeigen('home', false);
});
// Kind anlegen: derselbe Weg wie im Elternbereich (Name, dann Tier/Einstellungen); zurück führt zur Startseite
$('#btn-willkommen-kind').addEventListener('click', async () => {
  if (await kindNeu()) speicher.schreiben('willkommen', true);
});

// ---------- Start ----------

rasterZeichnen();

// Promise, damit Tests auf das Ende des Starts warten können
const startFertig = (async () => {
  // Datenbank öffnen (übernimmt ggf. alte Aufnahmen), Kinder laden, gelöschtes Profil abfangen, Medien laden
  const profile = await datenbank.profile();
  await kinderLaden();
  if (zustand.kind && !aktivesKind()) zustand.kind = kinder.length ? kinder[0].id : null;
  einstellungenLaden();
  if (zustand.profil !== STANDARD.id && !profile.some((p) => p.id === zustand.profil)) {
    zustand.profil = STANDARD.id;
    if (!kinder.length) speicher.schreiben('profil', STANDARD.id);
  }
  await medienLaden();
  if ((kinder.length || profile.length) && mitmachName(location.hash) === null) speicherSchuetzen();
  rasterZeichnen();
  document.body.classList.remove('laedt');
  // Eingeladen zum Mitmachen (Link mit #mitmachen=…): nur die Mitmach-Seite, keine Begrüßung, kein „Wer spielt?“
  mitmachBeimStart = mitmachName(location.hash);
  if (mitmachBeimStart !== null) mitmachenStarten(mitmachBeimStart);
  // Mit Kindern beginnt die App mit "Wer spielt?"
  else if (kinder.length && $('#home').classList.contains('active')) {
    werZeichnen();
    zeigen('wer', false);
  }
  // Allererster Start auf einem neuen Gerät: kurz für die Eltern erklären (einmalig)
  else if ((await willkommenNoetig()) && $('#home').classList.contains('active')) zeigen('willkommen', false);
})();

// Nicht beim Mitmachen: Oma soll nur aufnehmen, nicht alle Töne der App (ca. 18 MB) über ihr Handynetz laden
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && mitmachName(location.hash) === null) {
  // Neue Version übernommen: einmal neu laden, damit sie sofort sichtbar ist (nicht beim allerersten Start)
  const hatteVersion = !!navigator.serviceWorker.controller;
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteVersion || neuGeladen) return;
    neuGeladen = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => reg.update())
    .catch(() => {});
  // Auch beim Zurückholen aus dem Hintergrund nach Updates suchen (dabei wird die Seite nicht neu geladen)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update()).catch(() => {});
  });
}

$('#app-version').textContent = `Version ${APP_VERSION}`;

// Einstellung Vibration (gilt für das ganze Gerät)
(() => {
  const box = $('#vibration-an');
  box.checked = vibration.an;
  box.addEventListener('change', () => {
    vibration.an = box.checked;
    speicher.schreiben('vibration', box.checked);
    if (box.checked) vibrieren(40);
  });
  if (!vibration.moeglich) {
    box.disabled = true;
    $('#vibration-hinweis').textContent = 'Dieses Gerät bzw. dieser Browser kann nicht vibrieren (z. B. iPhone).';
  }
})();

// Von Hand: Update holen und neu laden (falls ein Gerät hängen geblieben ist)
$('#btn-update').addEventListener('click', async () => {
  try {
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  } catch { /* offline: einfach neu laden */ }
  location.reload();
});
