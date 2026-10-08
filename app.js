'use strict';

// Bei jeder Änderung zusammen mit CACHE in sw.js erhöhen (wird im Elternbereich angezeigt)
const APP_VERSION = 29;

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

async function medienLaden() {
  Object.values(medien).forEach((m) => m.bildUrl && URL.revokeObjectURL(m.bildUrl));
  medien = {};
  eigeneWoerter = [];
  if (zustand.profil === STANDARD.id) return;
  const profil = (await datenbank.profile()).find((p) => p.id === zustand.profil);
  eigeneWoerter = (profil && profil.woerter) || [];
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
    : k.tier;
}

// Sterne, Schrift und Profil kommen vom aktiven Kind – ohne Kinder aus den App-weiten Einstellungen
function einstellungenLaden() {
  const k = aktivesKind();
  zustand.schreibweise = k ? k.schreibweise : speicher.lesen('schreibweise', 'klein');
  zustand.sterne = k ? k.sterne : speicher.lesen('sterne', {});
  zustand.profil = k ? k.profil : speicher.lesen('profil', STANDARD.id);
  zustand.album = k ? (k.album || []) : speicher.lesen('album', []);
  zustand.reihenfolge = k ? (k.reihenfolge || 'alphabet') : speicher.lesen('reihenfolge', 'alphabet');
  zustand.farbe = k ? (k.farbe || 'bunt') : speicher.lesen('farbe', 'bunt');
}

function einstellungenSpeichern() {
  const k = aktivesKind();
  if (k) {
    k.schreibweise = zustand.schreibweise;
    k.sterne = zustand.sterne;
    k.album = zustand.album;
    k.reihenfolge = zustand.reihenfolge;
    k.farbe = zustand.farbe;
    return datenbank.kindSpeichern(k);
  }
  speicher.schreiben('reihenfolge', zustand.reihenfolge);
  speicher.schreiben('farbe', zustand.farbe);
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
function audio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
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
  deutscheStimme = stimmen.find((v) => v.localService) || stimmen[0] || null;
}
if ('speechSynthesis' in window) {
  stimmeWaehlen();
  speechSynthesis.onvoiceschanged = stimmeWaehlen;
}

function sprechen(text) {
  if (!('speechSynthesis' in window)) return;
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

function lobQuelle() {
  const eigene = LOB_PLAETZE.filter((k) => medien[k] && medien[k].stimme);
  if (eigene.length) return { url: URL.createObjectURL(medien[zufall(eigene)].stimme), eigen: true };
  return { url: `audio/${zufall(LOB_PLAETZE)}.wav`, eigen: false };
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

function hauptWahl(e) {
  const d = dateiName(e.b);
  const eigene = () => medien[e.b] && medien[e.b].stimme;
  return {
    art: 'haupt', b: e.b, wort: e.wort, gewicht: 1,
    bild: () => bildHtml(e),
    ansage: () => [eigene() ? blobQuelle(eigene()) : { url: `audio/${d}.wav` }],
    wortAllein: () => [eigene() ? blobQuelle(eigene()) : { url: `audio/${d}-wort.wav` }],
  };
}

function woerterFuer(e) {
  const d = dateiName(e.b);
  const vorrat = [hauptWahl(e)];
  (e.mehr || []).forEach(([wort, bild], i) => vorrat.push({
    art: 'mehr', b: e.b, wort, gewicht: 1,
    bild: () => bild,
    ansage: () => [{ url: `audio/${d}-${i + 2}.wav` }],
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
    folge.push(lobQuelle());
    if (nameSagen && kind && kind.nameStimme) folge.push({ url: URL.createObjectURL(kind.nameStimme), eigen: true, name: true });
    folge.push(...w.wortAllein());
  } else {
    folge.push(...w.ansage());
  }
  return folge;
}

async function folgeAbspielen(folge, ersatzText) {
  wiedergabeStoppen();
  const nummer = wiedergabe.nummer;
  try {
    for (const q of folge) {
      if (nummer !== wiedergabe.nummer) return;
      await abspielen(q.url);
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
  stopAufnahme();
  const ziel = (history.state && history.state.screen) || 'home';
  if (ziel === 'eltern') {
    await elternZeichnen();
    zeigen('eltern', false);
    return;
  }
  if ($('#eltern').classList.contains('active') || $('#kind').classList.contains('active')) await elternVerlassen();
  clearTimeout(tafelZustand.jubelTimer);
  nameModusBeenden();
  rasterZeichnen();
  zeigen('home', false);
});

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

function freigeschaltet() {
  if (!montessori()) return new Set(BUCHSTABEN.map((e) => e.b));
  const frei = new Set();
  for (const gruppe of MONTESSORI_GRUPPEN) {
    gruppe.forEach((b) => frei.add(b));
    if (!gruppe.every((b) => (zustand.sterne[b] || 0) >= FREI_AB_STERNEN)) break;
  }
  return frei;
}

function rasterZeichnen() {
  // Oben links: wer gerade spielt (Tipp darauf -> "Wer spielt?")
  const k = aktivesKind();
  $('#btn-kind').hidden = !k;
  document.querySelector('.spiel-btn[data-spiel="name"]').hidden = !k || !nameZeichen(k.name).length;
  $('#regenbogen').hidden = !!k;
  if (k) $('#btn-kind').innerHTML = kindBildHtml(k);
  const grid = $('#grid');
  grid.innerHTML = '';
  const frei = freigeschaltet();
  buchstabenReihenfolge().forEach((i) => {
    const eintrag = BUCHSTABEN[i];
    const n = zustand.sterne[eintrag.b] || 0;
    const offen = frei.has(eintrag.b);
    const btn = document.createElement('button');
    btn.className = `kachel${offen ? '' : ' gesperrt'}`;
    btn.setAttribute('aria-label', offen ? `${eintrag.b} wie ${eintrag.wort}` : `${eintrag.b} – kommt später`);
    btn.innerHTML = `<span class="zeichen">${zeichenHtml(eintrag)}</span>`
      + `<span class="mini">${offen ? bildHtml(eintrag) : '🔒'}</span>`
      + `<span class="punkte">${'⭐'.repeat(n)}</span>`;
    btn.addEventListener('click', () => {
      if (offen) { buchstabeOeffnen(i); return; }
      // Gesperrt: kurz wackeln
      btn.classList.remove('wackeln-kachel');
      void btn.offsetWidth;
      btn.classList.add('wackeln-kachel');
    });
    grid.appendChild(btn);
  });
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

// Glitzer: ab und zu ein kleiner weißer Funken auf der Spur
function funkeln(p) {
  if (zustand.farbe !== 'glitzer' || Math.random() > 0.35) return;
  const r = 2 + Math.random() * 3;
  const x = p.x + (Math.random() - 0.5) * tafelZustand.linienbreite * 0.7;
  const y = p.y + (Math.random() - 0.5) * tafelZustand.linienbreite * 0.7;
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
  tafelZustand.geschafft = true;
  const eintrag = BUCHSTABEN[zustand.index];
  const freiVorher = freigeschaltet().size;
  const n = Math.min(MAX_STERNE, (zustand.sterne[eintrag.b] || 0) + 1);
  zustand.sterne[eintrag.b] = n;
  einstellungenSpeichern();
  $('#fortschritt').textContent = sterneText(n);

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

  // Danach neu starten, damit das Kind gleich nochmal üben kann
  clearTimeout(tafelZustand.jubelTimer);
  tafelZustand.jubelTimer = setTimeout(() => {
    jubel.classList.remove('zeigen', 'mit-sticker', 'mit-schloss');
    tafelLeeren();
  }, 2600 + (neuerSticker ? 800 : 0) + (neueBuchstaben ? 1200 : 0));
}

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
  return [...name.trim()]
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

function nameStarten() {
  const k = aktivesKind();
  if (!k) return;
  const zeichenListe = nameZeichen(k.name);
  if (!zeichenListe.length) return;
  zustand.nameModus = { zeichen: zeichenListe, pos: 0 };
  zustand.wahl = null;
  $('#bild').innerHTML = kindBildHtml(k);
  $('#fortschritt').textContent = '';
  zeigen('trace');
  nameSchrittZeigen();
  // Zum Start einmal den Namen hören, falls aufgenommen
  if (k.nameStimme) folgeAbspielen([blobQuelle(k.nameStimme)]);
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
  // Ganzer Name geschafft: großer Jubel mit Bild des Kindes, Lob und (falls aufgenommen) dem Namen
  const k = aktivesKind();
  const jubel = $('#jubel');
  $('#jubel-bild').innerHTML = k ? kindBildHtml(k) : '🏆';
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  folgeAbspielen([lobQuelle(), ...(k && k.nameStimme ? [blobQuelle(k.nameStimme)] : [])], 'Super!');
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

function buchstabeOeffnen(i) {
  nameModusBeenden();
  const gleicherBuchstabe = zustand.index === i && zustand.wahl;
  zustand.index = i;
  const eintrag = BUCHSTABEN[i];
  zustand.wahl = wortWaehlen(eintrag, gleicherBuchstabe ? zustand.wahl : null);
  $('#bild').innerHTML = zustand.wahl.bild();
  $('#fortschritt').textContent = sterneText(zustand.sterne[eintrag.b] || 0);
  if (!$('#trace').classList.contains('active')) zeigen('trace');
  // Layout erst nach dem Anzeigen messen
  requestAnimationFrame(tafelAufbauen);
  lautAbspielen(eintrag);
}

$('#btn-home').addEventListener('click', zurStartseite);
$('#btn-weiter').addEventListener('click', () => {
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
    const k = aktivesKind();
    if (k && k.nameStimme) folgeAbspielen([blobQuelle(k.nameStimme)]);
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
  $('#fortschritt-text').textContent =
    `${gesamt} Sterne gesammelt, ${fertig} von ${BUCHSTABEN.length} Buchstaben mit allen ${MAX_STERNE} Sternen.`;
  await elternZeichnen();
  zeigen('eltern');
}

async function elternZeichnen() {
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

function kinderListeZeichnen() {
  const box = $('#kinder-liste');
  box.innerHTML = '';
  kinder.forEach((k) => {
    const sterne = Object.values(k.sterne || {}).reduce((a, b) => a + b, 0);
    const zeile = document.createElement('button');
    zeile.className = 'kind-zeile';
    zeile.innerHTML = `<span class="kind-bild">${kindBildHtml(k)}</span>`
      + `<span class="w">${htmlText(k.name)}<br><small>${k.schreibweise === 'gross' ? 'GROSSE' : 'kleine'} Buchstaben`
      + ` · ${sterne} ⭐</small></span><span class="pfeil">✏️</span>`;
    zeile.addEventListener('click', () => kindBearbeiten(k.id));
    box.appendChild(zeile);
  });
}

$('#btn-kind-neu').addEventListener('click', async () => {
  const name = (prompt('Wie heißt das Kind?') || '').trim();
  if (!name) return;
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
    reihenfolge: erstesKind ? speicher.lesen('reihenfolge', 'alphabet') : 'alphabet',
    farbe: erstesKind ? speicher.lesen('farbe', 'bunt') : 'bunt',
    erstellt: Date.now(),
  };
  await datenbank.kindSpeichern(kind);
  if (erstesKind) { speicher.schreiben('sterne', {}); speicher.schreiben('album', []); }
  await kinderLaden();
  if (!aktivesKind()) { zustand.kind = kind.id; speicher.schreiben('kind', kind.id); }
  kindBearbeiten(kind.id);
});

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

  const profile = [STANDARD, ...(await datenbank.profile())];
  const box = $('#kind-profile');
  box.innerHTML = '';
  profile.forEach((p) => {
    const zeile = document.createElement('label');
    zeile.className = 'umschalter profil-zeile';
    zeile.innerHTML = `<input type="radio" name="kind-profil" ${p.id === k.profil ? 'checked' : ''}>`
      + `<span>${p.id === STANDARD.id ? '⭐ ' : ''}${htmlText(p.name)}</span>`;
    zeile.querySelector('input').addEventListener('change', () => kindAendern((kk) => { kk.profil = p.id; }));
    box.appendChild(zeile);
  });

  $('#kind-name-status').innerHTML = k.nameStimme
    ? `<b>Aufgenommen.</b> Das Lob klingt dann z. B. „Toll gemacht! … ${htmlText(k.name)}!“`
    : 'Noch nicht aufgenommen – das Lob kommt dann ohne Namen.';
  $('#btn-kind-name-anhoeren').disabled = !k.nameStimme;
  $('#btn-kind-name-weg').disabled = !k.nameStimme;

  const sterne = Object.values(k.sterne || {}).reduce((a, b) => a + b, 0);
  const fertig = BUCHSTABEN.filter((e) => (k.sterne[e.b] || 0) >= MAX_STERNE).length;
  $('#kind-sterne').textContent =
    `${sterne} Sterne gesammelt, ${fertig} von ${BUCHSTABEN.length} Buchstaben mit allen ${MAX_STERNE} Sternen.`;
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

async function profileZeichnen() {
  const liste = [STANDARD, ...(await datenbank.profile())];
  const box = $('#profile');
  box.innerHTML = '';
  liste.forEach((p) => {
    const zeile = document.createElement('label');
    zeile.className = 'umschalter profil-zeile';
    const beschreibung = p.id === STANDARD.id ? '<small>Thorsten &amp; mitgelieferte Bilder</small>' : '';
    zeile.innerHTML = `<input type="radio" name="profil" value="${p.id}" ${p.id === zustand.profil ? 'checked' : ''}>`
      + `<span>${p.id === STANDARD.id ? '⭐ ' : ''}${htmlText(p.name)}${beschreibung ? '<br>' + beschreibung : ''}</span>`;
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
}

async function aktivesProfil() {
  return (await datenbank.profile()).find((p) => p.id === zustand.profil);
}

async function profilNeu() {
  const name = (prompt('Wie soll das neue Profil heißen? (z. B. Mama)') || '').trim();
  if (!name) return;
  const profil = { id: `p-${Date.now().toString(36)}`, name: name.slice(0, 30), erstellt: Date.now() };
  await datenbank.profilSpeichern(profil);
  // Browser bitten, Fotos und Aufnahmen nicht bei Speicherknappheit zu löschen
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await profilAktivieren(profil.id);
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
  for (const k of kinder.filter((kk) => kk.profil === profil.id)) {
    k.profil = STANDARD.id;
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
      + 'Legen Sie ein eigenes Profil an, um Fotos zu machen und die Laute mit Ihrer Stimme aufzunehmen.</p>'
      + '<button class="text-btn" data-a="neu">➕ Eigenes Profil anlegen</button>';
    box.querySelector('[data-a=neu]').addEventListener('click', profilNeu);
    return;
  }
  box.innerHTML = '<p class="hinweis">Was Sie nicht ändern, kommt automatisch aus „Standard“. '
    + 'Sprechen Sie z. B. „mmm … mmm … Maus“. Alles bleibt nur auf diesem Gerät.</p>';
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
    box.appendChild(zeile);
  });
}

// Persönliche Wörter eines Buchstabens: Foto + eigene Aufnahme des Wortes
function eigeneWoerterBox(eintrag) {
  const box = document.createElement('div');
  box.className = 'eigene-woerter';
  eigeneWoerter.filter((w) => w.b === eintrag.b).forEach((w) => {
    const m = medien[`w-${w.id}`] || {};
    const zeile = document.createElement('div');
    zeile.className = 'eigenes-wort';
    zeile.innerHTML = `<span class="vorschau">${m.bildUrl ? `<img class="bild-datei foto" src="${m.bildUrl}" alt="">` : '💛'}</span>`
      + `<span class="w">${htmlText(w.wort)}<br><small>${m.stimme ? '<b>aufgenommen</b>' : 'noch nicht aufgenommen'}</small></span>`
      + '<button class="mini-btn" data-a="foto" aria-label="Foto wählen">📷</button>'
      + '<button class="mini-btn" data-a="rec" aria-label="Wort aufnehmen">🎙️</button>'
      + `<button class="mini-btn" data-a="play" aria-label="Anhören" ${m.stimme ? '' : 'disabled'}>▶️</button>`
      + '<button class="mini-btn" data-a="weg" aria-label="Wort löschen">🗑️</button>';
    const knopf = (a) => zeile.querySelector(`[data-a=${a}]`);
    knopf('foto').addEventListener('click', () => buchstabenFotoWaehlen(`w-${w.id}`));
    knopf('rec').addEventListener('click', (e) => medienAufnehmen(`w-${w.id}`, e.currentTarget));
    knopf('play').addEventListener('click', () => {
      const wahl = woerterFuer(eintrag).find((x) => x.id === w.id);
      if (wahl) folgeAbspielen(wahl.ansage());
    });
    knopf('weg').addEventListener('click', () => eigenesWortLoeschen(w));
    box.appendChild(zeile);
  });
  const neu = document.createElement('button');
  neu.className = 'text-btn klein';
  neu.textContent = `➕ eigenes Wort mit „${zeichen(eintrag)}“`;
  neu.addEventListener('click', () => eigenesWortNeu(eintrag));
  box.appendChild(neu);
  return box;
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

async function eigenesWortLoeschen(w) {
  if (!confirm(`„${w.wort}“ mit Foto und Aufnahme löschen?`)) return;
  const profil = await aktivesProfil();
  if (!profil) return;
  profil.woerter = (profil.woerter || []).filter((x) => x.id !== w.id);
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
async function aufnehmen(knopf, fertig) {
  if (rekorder && rekorder.state === 'recording') { stopAufnahme(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    alert('Aufnehmen geht nur über https bzw. in der installierten App.');
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alert('Kein Zugriff auf das Mikrofon.');
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
  // Sicherheitsstopp nach 5 Sekunden
  setTimeout(() => { if (r.state === 'recording') r.stop(); }, 5000);
}

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
  memory.timerNeu = setTimeout(() => { jubel.classList.remove('zeigen'); memoryNeu(); }, 3800);
}

function memoryStarten() {
  clearTimeout(memory.timerNeu);
  memoryNeu();
  zeigen('memory');
  folgeAbspielen([{ url: 'audio/ansage-memory.wav' }], 'Finde groß und klein!');
}

$('#btn-memory-home').addEventListener('click', () => {
  clearTimeout(memory.timer); clearTimeout(memory.timerNeu); wiedergabeStoppen(); zurStartseite();
});
$('#btn-memory-neu').addEventListener('click', () => { clearTimeout(memory.timerNeu); $('#memory-jubel').classList.remove('zeigen'); memoryNeu(); });

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

function albumZeichnen() {
  const alle = alleSticker();
  const gesammelt = new Set(zustand.album || []);
  $('#album-zahl').textContent = `${alle.filter((s) => gesammelt.has(s.key)).length} / ${alle.length}`;
  const raster = $('#album-raster');
  raster.innerHTML = '';
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
}

function albumOeffnen() {
  albumZeichnen();
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
  hoerSpiel.timer = setTimeout(() => {
    jubel.classList.remove('zeigen');
    hoerSpiel.runde = 0;
    hoerSpiel.ziel = null;
    hoerNeueRunde();
  }, 3200);
}

function hoerSpielStarten() {
  clearTimeout(hoerSpiel.timer);
  hoerSpiel.runde = 0;
  hoerSpiel.ziel = null;
  zeigen('hoeren');
  hoerNeueRunde();
}

$('#btn-hoeren-home').addEventListener('click', () => { clearTimeout(hoerSpiel.timer); wiedergabeStoppen(); zurStartseite(); });
$('#btn-hoeren-laut').addEventListener('click', () => { audio(); hoerLautAbspielen(false); });

// Spiele-Leiste
const SPIELE = { hoeren: hoerSpielStarten, name: nameStarten, memory: memoryStarten, album: albumOeffnen };
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
const textZuBlob = async (daten) => (await fetch(daten)).blob();

// Alles Eigene einsammeln: Profile mit Medien, Kinder mit Foto/Namensaufnahme, App-weite Einstellungen
async function sicherungErstellen() {
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
  for (const k of await datenbank.kinder()) {
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
    einstellungen: {
      schreibweise: speicher.lesen('schreibweise', 'klein'),
      sterne: speicher.lesen('sterne', {}),
      profil: speicher.lesen('profil', STANDARD.id),
      album: speicher.lesen('album', []),
      reihenfolge: speicher.lesen('reihenfolge', 'alphabet'),
      farbe: speicher.lesen('farbe', 'bunt'),
    },
    profile,
    kinder: kinderListe,
  };
}

// Einspielen: Profile und Kinder aus der Datei kommen dazu bzw. ersetzen die mit gleicher ID.
// Was es nur auf diesem Gerät gibt, bleibt unangetastet.
async function sicherungEinspielen(s) {
  if (!s || s.format !== SICHERUNG_FORMAT || !Array.isArray(s.profile) || !Array.isArray(s.kinder)) {
    throw new Error('Das ist keine Sicherung dieser App.');
  }
  if (s.version > SICHERUNG_VERSION) throw new Error('Die Sicherung stammt aus einer neueren App-Version. Bitte die App aktualisieren.');
  const warFrisch = kinder.length === 0 && (await datenbank.profile()).length === 0;
  for (const { medien: medienListe, ...profil } of s.profile) {
    if (!profil.id || !profil.name) continue;
    // Alte Medien dieses Profils ersetzen, damit gelöschte Aufnahmen nicht wieder auftauchen
    await datenbank.profilLoeschen(profil.id);
    await datenbank.profilSpeichern(profil);
    for (const m of medienListe || []) {
      if (typeof m.schluessel === 'string' && m.schluessel.startsWith(`${profil.id}|`)) {
        await datenbank.medienRoh(m.schluessel, await textZuBlob(m.daten));
      }
    }
  }
  for (const k of s.kinder) {
    if (!k.id || !k.name) continue;
    await datenbank.kindSpeichern({
      ...k,
      foto: k.foto ? await textZuBlob(k.foto) : null,
      nameStimme: k.nameStimme ? await textZuBlob(k.nameStimme) : null,
      sterne: k.sterne || {},
    });
  }
  // App-weite Einstellungen nur auf einem frischen Gerät übernehmen (sonst nichts überschreiben)
  if (warFrisch && s.einstellungen) {
    speicher.schreiben('schreibweise', s.einstellungen.schreibweise || 'klein');
    speicher.schreiben('sterne', s.einstellungen.sterne || {});
    speicher.schreiben('profil', s.einstellungen.profil || STANDARD.id);
    speicher.schreiben('album', s.einstellungen.album || []);
    speicher.schreiben('reihenfolge', s.einstellungen.reihenfolge || 'alphabet');
    speicher.schreiben('farbe', s.einstellungen.farbe || 'bunt');
  }
  await kinderLaden();
  if (!aktivesKind() && kinder.length) { zustand.kind = kinder[0].id; speicher.schreiben('kind', zustand.kind); }
  einstellungenLaden();
  if (zustand.profil !== STANDARD.id && !(await datenbank.profile()).some((p) => p.id === zustand.profil)) {
    zustand.profil = STANDARD.id;
  }
  await medienLaden();
  return { profile: s.profile.length, kinder: s.kinder.length };
}

function sicherungDateiname() {
  return `buchstaben-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
}

async function sicherungAlsDatei() {
  const daten = await sicherungErstellen();
  return new File([JSON.stringify(daten)], sicherungDateiname(), { type: 'application/json' });
}

function sicherungZusammenfassung() {
  const box = $('#sicherung-info');
  datenbank.profile().then((profile) => {
    box.textContent = `Auf diesem Gerät: ${profile.length} eigene${profile.length === 1 ? 's Profil' : ' Profile'}, `
      + `${kinder.length} ${kinder.length === 1 ? 'Kind' : 'Kinder'}.`;
  });
}

$('#btn-sichern').addEventListener('click', async (e) => {
  const knopf = e.currentTarget;
  knopf.disabled = true;
  try {
    const datei = await sicherungAlsDatei();
    const url = URL.createObjectURL(datei);
    const a = document.createElement('a');
    a.href = url;
    a.download = datei.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    alert('Die Sicherung konnte nicht erstellt werden.');
  } finally {
    knopf.disabled = false;
  }
});

$('#btn-teilen').addEventListener('click', async (e) => {
  const knopf = e.currentTarget;
  knopf.disabled = true;
  try {
    const datei = await sicherungAlsDatei();
    await navigator.share({ files: [datei], title: 'Buchstaben-Sicherung' });
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
    const inhalt = JSON.parse(await datei.text());
    const anzahl = { profile: (inhalt.profile || []).length, kinder: (inhalt.kinder || []).length };
    if (!confirm(`Sicherung einspielen: ${anzahl.profile} Profil(e) und ${anzahl.kinder} Kind(er).\n`
      + 'Gleiche Profile/Kinder werden aktualisiert, alles andere bleibt erhalten.')) return;
    const ergebnis = await sicherungEinspielen(inhalt);
    await elternOeffnen();
    alert(`Fertig: ${ergebnis.profile} Profil(e) und ${ergebnis.kinder} Kind(er) übernommen.`);
  } catch (fehler) {
    alert(fehler instanceof SyntaxError ? 'Die Datei ist keine gültige Sicherung.' : (fehler.message || 'Einspielen fehlgeschlagen.'));
  }
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
  rasterZeichnen();
  // Mit Kindern beginnt die App mit "Wer spielt?"
  if (kinder.length && $('#home').classList.contains('active')) {
    werZeichnen();
    zeigen('wer', false);
  }
})();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
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
