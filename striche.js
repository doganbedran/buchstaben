// Strichfolge der Buchstaben in Schreibrichtung (Druckschrift der Grundschule).
// Koordinaten im Vierlinien-System: y = 0 Oberlinie, 50 Mittellinie, 100 Grundlinie, 140 Unterlinie.
// Jeder Buchstabe ist eine Liste von Strichen, jeder Strich eine Liste von Punkten [x, y] in Zeichenrichtung.
// Buchstaben ohne Eintrag werden wie bisher aus der Schrift gezeichnet und per Fläche geprüft.

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

const STRICHE = {
  // A: linke Schräge runter, rechte Schräge runter, Querstrich von links nach rechts
  A: [
    gerade(35, 0, 0, 100),
    gerade(35, 0, 70, 100),
    gerade(13, 63, 57, 63),
  ],
  // H: links runter, rechts runter, Querstrich
  H: [
    gerade(0, 0, 0, 100),
    gerade(60, 0, 60, 100),
    gerade(0, 50, 60, 50),
  ],
  // a (rundes Schul-a): Bauch gegen den Uhrzeigersinn, oben rechts beginnend, dann Strich rechts runter
  a: [
    bogen(21, 75, 21, 25, 35, 395),
    gerade(44, 50, 44, 100),
  ],
  // m: runter, dann zweimal hoch-Bogen-runter
  m: [
    gerade(0, 50, 0, 100),
    verbinde(bogen(17, 64, 17, 14, 180, 0), gerade(34, 64, 34, 100)),
    verbinde(bogen(51, 64, 17, 14, 180, 0), gerade(68, 64, 68, 100)),
  ],
};
