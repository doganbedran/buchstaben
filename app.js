'use strict';

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
        const req = indexedDB.open('lernapp', 2);
        req.onupgradeneeded = (ev) => {
          const db = req.result;
          if (!db.objectStoreNames.contains('aufnahmen')) db.createObjectStore('aufnahmen');
          if (!db.objectStoreNames.contains('profile')) db.createObjectStore('profile', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('medien')) db.createObjectStore('medien');
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

async function medienLaden() {
  Object.values(medien).forEach((m) => m.bildUrl && URL.revokeObjectURL(m.bildUrl));
  medien = {};
  if (zustand.profil === STANDARD.id) return;
  for (const { schluessel, blob } of await datenbank.medienVon(zustand.profil)) {
    const [, b, art] = schluessel.split('|');
    const m = medien[b] || (medien[b] = {});
    if (art === 'bild') m.bildUrl = URL.createObjectURL(blob);
    else if (art === 'stimme') m.stimme = blob;
  }
}

async function profilAktivieren(id) {
  zustand.profil = id;
  speicher.schreiben('profil', id);
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

// Reihenfolge: eigene Aufnahme (aktives Profil) > Audiodatei (Piper) > Sprachausgabe des Geräts
async function lautAbspielen(eintrag, lob = false) {
  wiedergabeStoppen();
  const nummer = wiedergabe.nummer;
  const eigene = medien[eintrag.b] && medien[eintrag.b].stimme;
  const eigeneUrl = eigene ? URL.createObjectURL(eigene) : null;
  const lobDaten = lob ? lobQuelle() : null;
  const quellen = [];
  if (lobDaten) quellen.push(lobDaten.url);
  quellen.push(eigeneUrl || `audio/${dateiName(eintrag.b)}${lob ? '-wort' : ''}.wav`);
  try {
    for (const q of quellen) {
      if (nummer !== wiedergabe.nummer) return;
      await abspielen(q);
    }
  } catch {
    if (nummer !== wiedergabe.nummer) return;
    const satz = `${eintrag.laut} … ${eintrag.laut} wie ${eintrag.wort}`;
    sprechen(lob ? `Super! ${eintrag.wort}` : satz);
  } finally {
    if (eigeneUrl) URL.revokeObjectURL(eigeneUrl);
    if (lobDaten && lobDaten.eigen) URL.revokeObjectURL(lobDaten.url);
  }
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

window.addEventListener('popstate', () => {
  wiedergabeStoppen();
  stopAufnahme();
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

function rasterZeichnen() {
  const grid = $('#grid');
  grid.innerHTML = '';
  BUCHSTABEN.forEach((eintrag, i) => {
    const n = zustand.sterne[eintrag.b] || 0;
    const btn = document.createElement('button');
    btn.className = 'kachel';
    btn.setAttribute('aria-label', `${eintrag.b} wie ${eintrag.wort}`);
    btn.innerHTML = `<span class="zeichen">${zeichen(eintrag)}</span>`
      + `<span class="mini">${bildHtml(eintrag)}</span>`
      + `<span class="punkte">${'⭐'.repeat(n)}</span>`;
    btn.addEventListener('click', () => buchstabeOeffnen(i));
    grid.appendChild(btn);
  });
}

// ---------- Nachspuren ----------

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');

// Prüf-Raster in niedriger Auflösung: Ziel (Buchstabe), erlaubt (Buchstabe + Toleranz), Spur des Kindes
const PRUEF_BREITE = 140;
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
    c.fillStyle = '#f1e8da';
    c.fillText(text(), s.x, s.y);
    c.setLineDash([2, 10]);
    c.lineCap = 'round';
    c.lineWidth = 4;
    c.strokeStyle = '#c9b79c';
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

function tafelAufbauen() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  tafelZustand.breite = rect.width;
  tafelZustand.hoehe = rect.height;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  tafelZustand.schrift = buchstabenLayout(text(), rect.width, rect.height);
  // Spurbreite etwas dicker als der Buchstabenstrich, fingerbreit, aber nicht klecksig
  tafelZustand.linienbreite = Math.min(48, Math.max(22, tafelZustand.schrift.groesse * 0.14));

  pruef.skala = PRUEF_BREITE / rect.width;
  pruef.spur.width = Math.round(rect.width * pruef.skala);
  pruef.spur.height = Math.round(rect.height * pruef.skala);
  pruef.ziel = maske('ziel');
  pruef.erlaubt = maske('erlaubt');

  tafelLeeren();
}

function tafelLeeren() {
  const dpr = canvas.width / (tafelZustand.breite || 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  buchstabeMalen(ctx, tafelZustand.schrift, dpr, 'vorlage');
  spurCtx.clearRect(0, 0, pruef.spur.width, pruef.spur.height);
  tafelZustand.geschafft = false;
}

const SPUR_FARBEN = ['#f28c38', '#3d8fd1', '#4caf50', '#9b59b6', '#e0567c', '#e6a700'];

function linie(von, bis) {
  const dpr = canvas.width / tafelZustand.breite;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = tafelZustand.linienbreite;
  ctx.strokeStyle = SPUR_FARBEN[zustand.index % SPUR_FARBEN.length];
  ctx.beginPath();
  ctx.moveTo(von.x, von.y);
  ctx.lineTo(bis.x, bis.y);
  ctx.stroke();

  const s = pruef.skala;
  spurCtx.lineCap = 'round';
  spurCtx.lineWidth = tafelZustand.linienbreite * s;
  spurCtx.strokeStyle = '#000';
  spurCtx.beginPath();
  spurCtx.moveTo(von.x * s, von.y * s);
  spurCtx.lineTo(bis.x * s, bis.y * s);
  spurCtx.stroke();
}

function punkt(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (e) => {
  if (tafelZustand.pointerId !== null || tafelZustand.geschafft) return;
  e.preventDefault();
  audio();
  tafelZustand.pointerId = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ältere Browser */ }
  const p = punkt(e);
  tafelZustand.letzter = p;
  linie(p, p);
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== tafelZustand.pointerId) return;
  // Zwischenpunkte nutzen, damit schnelle Striche nicht eckig werden
  const gesammelt = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of gesammelt.length ? gesammelt : [e]) {
    const p = punkt(ev);
    linie(tafelZustand.letzter, p);
    tafelZustand.letzter = p;
  }
});

function strichEnde(e) {
  if (e.pointerId !== tafelZustand.pointerId) return;
  tafelZustand.pointerId = null;
  tafelZustand.letzter = null;
  pruefen();
}
canvas.addEventListener('pointerup', strichEnde);
canvas.addEventListener('pointercancel', strichEnde);

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
  tafelZustand.messung = { abdeckung, danebenAnteil };
  // Großzügig für 3- bis 4-Jährige: 75 % des Buchstabens getroffen, höchstens 25 % daneben
  if (abdeckung >= 0.75 && danebenAnteil <= 0.25) geschafft();
}

function geschafft() {
  tafelZustand.geschafft = true;
  const eintrag = BUCHSTABEN[zustand.index];
  const n = Math.min(MAX_STERNE, (zustand.sterne[eintrag.b] || 0) + 1);
  zustand.sterne[eintrag.b] = n;
  speicher.schreiben('sterne', zustand.sterne);
  $('#fortschritt').textContent = sterneText(n);

  glockenspiel();
  sterneFliegen();
  const jubel = $('#jubel');
  $('#jubel-bild').innerHTML = bildHtml(eintrag);
  jubel.classList.remove('zeigen');
  void jubel.offsetWidth;
  jubel.classList.add('zeigen');
  setTimeout(() => lautAbspielen(eintrag, true), 500);

  // Danach neu starten, damit das Kind gleich nochmal üben kann
  setTimeout(() => {
    jubel.classList.remove('zeigen');
    tafelLeeren();
  }, 2600);
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

function buchstabeOeffnen(i) {
  zustand.index = i;
  const eintrag = BUCHSTABEN[i];
  $('#bild').innerHTML = bildHtml(eintrag);
  $('#fortschritt').textContent = sterneText(zustand.sterne[eintrag.b] || 0);
  if (!$('#trace').classList.contains('active')) zeigen('trace');
  // Layout erst nach dem Anzeigen messen
  requestAnimationFrame(tafelAufbauen);
  lautAbspielen(eintrag);
}

$('#btn-home').addEventListener('click', zurStartseite);
$('#btn-weiter').addEventListener('click', () => buchstabeOeffnen((zustand.index + 1) % BUCHSTABEN.length));
$('#btn-loeschen').addEventListener('click', tafelLeeren);
$('#btn-laut').addEventListener('click', () => lautAbspielen(BUCHSTABEN[zustand.index]));
$('#btn-bild').addEventListener('click', () => {
  const karte = $('#btn-bild');
  karte.classList.remove('wackeln');
  void karte.offsetWidth;
  karte.classList.add('wackeln');
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
  const gesamt = BUCHSTABEN.reduce((sum, e) => sum + (zustand.sterne[e.b] || 0), 0);
  const fertig = BUCHSTABEN.filter((e) => (zustand.sterne[e.b] || 0) >= MAX_STERNE).length;
  $('#fortschritt-text').textContent =
    `${gesamt} Sterne gesammelt, ${fertig} von ${BUCHSTABEN.length} Buchstaben mit allen ${MAX_STERNE} Sternen.`;
  await elternZeichnen();
  zeigen('eltern');
}

async function elternZeichnen() {
  await profileZeichnen();
  medienZeichnen();
}

function medienZeichnen() {
  lobZeichnen();
  anpassenZeichnen();
}

document.querySelectorAll('input[name="schreibweise"]').forEach((r) => {
  r.addEventListener('change', () => {
    zustand.schreibweise = r.value;
    speicher.schreiben('schreibweise', r.value);
    medienZeichnen();
  });
});

$('#btn-eltern-zurueck').addEventListener('click', () => { stopAufnahme(); zurStartseite(); });

$('#btn-reset').addEventListener('click', () => {
  if (!confirm('Alle Sterne wirklich zurücksetzen?')) return;
  zustand.sterne = {};
  speicher.schreiben('sterne', {});
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
    knopf('foto').addEventListener('click', () => fotoWaehlen(eintrag.b));
    knopf('bild-weg').addEventListener('click', () => medienEntfernen(eintrag.b, 'bild'));
    knopf('rec').addEventListener('click', (e) => aufnehmen(eintrag.b, e.currentTarget));
    knopf('play').addEventListener('click', () => lautAbspielen(eintrag));
    knopf('stimme-weg').addEventListener('click', () => medienEntfernen(eintrag.b, 'stimme'));
    box.appendChild(zeile);
  });
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
    zeile.querySelector('[data-a=rec]').addEventListener('click', (e) => aufnehmen(platz, e.currentTarget));
    zeile.querySelector('[data-a=play]').addEventListener('click', () => lobAnhoeren(platz));
    zeile.querySelector('[data-a=weg]').addEventListener('click', () => medienEntfernen(platz, 'stimme'));
    box.appendChild(zeile);
  });
}

let fotoFuer = null;
function fotoWaehlen(b) {
  fotoFuer = b;
  const input = $('#foto-input');
  input.value = '';
  input.click();
}

$('#foto-input').addEventListener('change', async (e) => {
  const datei = e.target.files && e.target.files[0];
  if (!datei || !fotoFuer) return;
  try {
    const blob = await fotoVerkleinern(datei);
    await datenbank.medienSetzen(zustand.profil, fotoFuer, 'bild', blob);
    await medienLaden();
    medienZeichnen();
  } catch {
    alert('Das Foto konnte nicht geladen werden.');
  }
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

async function aufnehmen(b, knopf) {
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
  const profil = zustand.profil;
  const teile = [];
  const r = new MediaRecorder(stream);
  rekorder = r;
  r.ondataavailable = (e) => { if (e.data.size) teile.push(e.data); };
  r.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    if (teile.length) await datenbank.medienSetzen(profil, b, 'stimme', new Blob(teile, { type: r.mimeType }));
    if (rekorder === r) rekorder = null;
    await medienLaden();
    if ($('#eltern').classList.contains('active')) medienZeichnen();
  };
  r.start();
  knopf.classList.add('aktiv');
  knopf.textContent = '⏹️';
  // Sicherheitsstopp nach 5 Sekunden
  setTimeout(() => { if (r.state === 'recording') r.stop(); }, 5000);
}

// ---------- Start ----------

rasterZeichnen();

// Promise, damit Tests auf das Ende des Starts warten können
const startFertig = (async () => {
  // Datenbank öffnen (übernimmt ggf. alte Aufnahmen), gelöschtes Profil abfangen, eigene Medien laden
  const profile = await datenbank.profile();
  if (zustand.profil !== STANDARD.id && !profile.some((p) => p.id === zustand.profil)) {
    zustand.profil = STANDARD.id;
    speicher.schreiben('profil', STANDARD.id);
  }
  await medienLaden();
  rasterZeichnen();
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
}
