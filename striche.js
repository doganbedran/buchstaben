// Strichfolge der Buchstaben in Schreibrichtung (Druckschrift der Grundschule).
// Koordinaten im Vierlinien-System: y = 0 Oberlinie, 50 Mittellinie, 100 Grundlinie, 140 Unterlinie.
// Jeder Buchstabe ist eine Liste von Strichen, jeder Strich eine Liste von Punkten [x, y] in Zeichenrichtung.
// Regeln: von oben nach unten, von links nach rechts, Senkrechte vor Bögen, Querstriche und Punkte zuletzt.

// Gerade Linie von (x1, y1) nach (x2, y2)
function gerade(x1, y1, x2, y2) {
  const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
  return Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
}

// Bogen um (cx, cy) mit Radien rx/ry, Winkel in Grad wie in der Mathematik (0° = rechts, 90° = oben).
// von < bis: gegen den Uhrzeigersinn, von > bis: im Uhrzeigersinn.
function bogen(cx, cy, rx, ry, von, bis) {
  const n = Math.max(8, Math.ceil(Math.abs(bis - von) / 4));
  return Array.from({ length: n + 1 }, (_, i) => {
    const w = ((von + ((bis - von) * i) / n) * Math.PI) / 180;
    return [cx + rx * Math.cos(w), cy - ry * Math.sin(w)];
  });
}

// Teilstücke zu einem Strich verbinden (doppelte Punkte an den Übergängen entfernen)
function verbinde(...teile) {
  return teile.reduce((alle, teil) => alle.concat(alle.length ? teil.slice(1) : teil), []);
}

// Punkt (i, j, Umlaute): ganz kurzer Strich – antippen reicht
function punkt(x, y) {
  return gerade(x, y - 2, x, y + 2);
}

// Wiederkehrende Formen
const kreisKlein = () => bogen(21, 75, 21, 25, 35, 395);           // Bauch von a, d, g, q (oben rechts beginnend)
const bauchRechts = () => bogen(22, 75, 22, 25, 180, -180);        // Bauch von b, p (am Stamm beginnend, im Uhrzeigersinn)
const O_GROSS = () => bogen(40, 50, 40, 50, 90, 450);
const A_GROSS = () => [gerade(35, 0, 0, 100), gerade(35, 0, 70, 100), gerade(13, 63, 57, 63)];
const U_GROSS = () => [verbinde(gerade(0, 0, 0, 65), bogen(28, 65, 28, 35, 180, 360), gerade(56, 65, 56, 0))];
const U_KLEIN = () => [verbinde(gerade(0, 50, 0, 84), bogen(20, 84, 20, 16, 180, 360), gerade(40, 84, 40, 50)), gerade(40, 50, 40, 100)];

const STRICHE = {
  // ---------- Großbuchstaben (Oberlinie 0 bis Grundlinie 100) ----------
  A: A_GROSS(),
  B: [
    gerade(0, 0, 0, 100),
    verbinde(gerade(0, 0, 25, 0), bogen(25, 25, 23, 25, 90, -90), gerade(25, 50, 0, 50)),
    verbinde(gerade(0, 50, 28, 50), bogen(28, 75, 25, 25, 90, -90), gerade(28, 100, 0, 100)),
  ],
  C: [bogen(40, 50, 40, 50, 45, 315)],
  D: [
    gerade(0, 0, 0, 100),
    verbinde(gerade(0, 0, 20, 0), bogen(20, 50, 45, 50, 90, -90), gerade(20, 100, 0, 100)),
  ],
  E: [gerade(0, 0, 0, 100), gerade(0, 0, 50, 0), gerade(0, 50, 42, 50), gerade(0, 100, 50, 100)],
  F: [gerade(0, 0, 0, 100), gerade(0, 0, 48, 0), gerade(0, 50, 40, 50)],
  G: [verbinde(bogen(40, 50, 40, 50, 45, 360), gerade(80, 50, 48, 50))],
  H: [gerade(0, 0, 0, 100), gerade(60, 0, 60, 100), gerade(0, 50, 60, 50)],
  I: [gerade(0, 0, 0, 100)],
  J: [verbinde(gerade(40, 0, 40, 75), bogen(20, 75, 20, 25, 0, -180))],
  K: [gerade(0, 0, 0, 100), verbinde(gerade(50, 0, 3, 50), gerade(3, 50, 52, 100))],
  L: [verbinde(gerade(0, 0, 0, 100), gerade(0, 100, 45, 100))],
  M: [gerade(0, 0, 0, 100), verbinde(gerade(0, 0, 35, 60), gerade(35, 60, 70, 0), gerade(70, 0, 70, 100))],
  N: [gerade(0, 0, 0, 100), verbinde(gerade(0, 0, 55, 100), gerade(55, 100, 55, 0))],
  O: [O_GROSS()],
  P: [gerade(0, 0, 0, 100), verbinde(gerade(0, 0, 25, 0), bogen(25, 27, 25, 27, 90, -90), gerade(25, 54, 0, 54))],
  Q: [O_GROSS(), gerade(50, 72, 84, 106)],
  R: [
    gerade(0, 0, 0, 100),
    verbinde(gerade(0, 0, 25, 0), bogen(25, 27, 25, 27, 90, -90), gerade(25, 54, 0, 54)),
    gerade(22, 54, 55, 100),
  ],
  S: [verbinde(bogen(30, 25, 28, 25, 30, 270), bogen(30, 75, 28, 25, 90, -150))],
  T: [gerade(0, 0, 56, 0), gerade(28, 0, 28, 100)],
  U: U_GROSS(),
  V: [verbinde(gerade(0, 0, 30, 100), gerade(30, 100, 60, 0))],
  W: [verbinde(gerade(0, 0, 20, 100), gerade(20, 100, 42, 30), gerade(42, 30, 64, 100), gerade(64, 100, 84, 0))],
  X: [gerade(0, 0, 56, 100), gerade(56, 0, 0, 100)],
  Y: [gerade(0, 0, 30, 50), verbinde(gerade(60, 0, 30, 50), gerade(30, 50, 30, 100))],
  Z: [verbinde(gerade(0, 0, 55, 0), gerade(55, 0, 0, 100), gerade(0, 100, 55, 100))],
  Ä: [...A_GROSS(), punkt(22, -18), punkt(48, -18)],
  Ö: [O_GROSS(), punkt(27, -18), punkt(53, -18)],
  Ü: [...U_GROSS(), punkt(16, -18), punkt(40, -18)],
  ẞ: [
    verbinde(gerade(0, 100, 0, 22), bogen(24, 22, 24, 22, 180, 0), gerade(48, 22, 22, 50)),
    verbinde(gerade(22, 50, 28, 50), bogen(28, 75, 24, 25, 90, -110), gerade(20, 98, 10, 96)),
  ],

  // ---------- Kleinbuchstaben (Mittellinie 50 bis Grundlinie 100, Ober-/Unterlängen bis 0 bzw. 140) ----------
  a: [kreisKlein(), gerade(44, 50, 44, 100)],
  b: [gerade(0, 0, 0, 100), bauchRechts()],
  c: [bogen(22, 75, 22, 25, 45, 315)],
  d: [kreisKlein(), gerade(44, 0, 44, 100)],
  e: [verbinde(gerade(2, 75, 44, 75), bogen(23, 75, 21, 25, 0, 315))],
  f: [verbinde(bogen(30, 15, 15, 15, 30, 180), gerade(15, 15, 15, 100)), gerade(2, 50, 32, 50)],
  g: [kreisKlein(), verbinde(gerade(44, 50, 44, 120), bogen(24, 120, 20, 20, 0, -160))],
  h: [gerade(0, 0, 0, 100), verbinde(bogen(20, 66, 20, 16, 180, 0), gerade(40, 66, 40, 100))],
  i: [gerade(0, 50, 0, 100), punkt(0, 30)],
  j: [verbinde(gerade(20, 50, 20, 120), bogen(0, 120, 20, 20, 0, -160)), punkt(20, 30)],
  k: [gerade(0, 0, 0, 100), verbinde(gerade(38, 50, 2, 76), gerade(2, 76, 40, 100))],
  l: [gerade(0, 0, 0, 100)],
  m: [
    gerade(0, 50, 0, 100),
    verbinde(bogen(17, 64, 17, 14, 180, 0), gerade(34, 64, 34, 100)),
    verbinde(bogen(51, 64, 17, 14, 180, 0), gerade(68, 64, 68, 100)),
  ],
  n: [gerade(0, 50, 0, 100), verbinde(bogen(20, 66, 20, 16, 180, 0), gerade(40, 66, 40, 100))],
  o: [bogen(23, 75, 23, 25, 90, 450)],
  p: [gerade(0, 50, 0, 140), bauchRechts()],
  q: [kreisKlein(), gerade(44, 50, 44, 140)],
  r: [gerade(0, 50, 0, 100), bogen(20, 68, 20, 18, 180, 40)],
  s: [verbinde(bogen(20, 62, 18, 12, 30, 270), bogen(20, 87, 18, 13, 90, -150))],
  t: [verbinde(gerade(12, 15, 12, 90), bogen(22, 90, 10, 10, 180, 300)), gerade(0, 50, 30, 50)],
  u: U_KLEIN(),
  v: [verbinde(gerade(0, 50, 22, 100), gerade(22, 100, 44, 50))],
  w: [verbinde(gerade(0, 50, 15, 100), gerade(15, 100, 30, 62), gerade(30, 62, 45, 100), gerade(45, 100, 60, 50))],
  x: [gerade(0, 50, 40, 100), gerade(40, 50, 0, 100)],
  y: [gerade(0, 50, 22, 100), gerade(44, 50, 10, 140)],
  z: [verbinde(gerade(0, 50, 40, 50), gerade(40, 50, 0, 100), gerade(0, 100, 40, 100))],
  ä: [kreisKlein(), gerade(44, 50, 44, 100), punkt(11, 30), punkt(33, 30)],
  ö: [bogen(23, 75, 23, 25, 90, 450), punkt(12, 30), punkt(34, 30)],
  ü: [...U_KLEIN(), punkt(9, 30), punkt(31, 30)],
  ß: [
    verbinde(gerade(0, 100, 0, 22), bogen(20, 22, 20, 22, 180, 0), gerade(40, 22, 18, 52)),
    verbinde(gerade(18, 52, 24, 52), bogen(24, 76, 20, 24, 90, -110), gerade(17, 98, 8, 96)),
  ],
};
