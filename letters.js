// Deutsches Alphabet mit Anlaut-Wort und Bild (Emoji): a–z, danach ä, ö, ü, ß.
// "laut" ist das, was die Sprachausgabe als Notlösung spricht (Montessori: Laut statt Buchstabenname).
// Beim ß gibt es kein Wort mit dem Laut am Anfang – dort steckt er im Wort.
// "bild" ist ein Emoji oder eine Datei in bilder/ (wo es kein passendes Emoji gibt).
const BUCHSTABEN = [
  { b: 'a', wort: 'Apfel',    bild: '🍎', laut: 'a' },
  { b: 'b', wort: 'Banane',   bild: '🍌', laut: 'ba' },
  { b: 'c', wort: 'Computer', bild: '💻', laut: 'ko' },
  { b: 'd', wort: 'Delphin',  bild: '🐬', laut: 'de' },
  { b: 'e', wort: 'Elefant',  bild: '🐘', laut: 'e' },
  { b: 'f', wort: 'Fisch',    bild: '🐟', laut: 'fff' },
  { b: 'g', wort: 'Gitarre',  bild: '🎸', laut: 'gi' },
  { b: 'h', wort: 'Hund',     bild: '🐶', laut: 'hu' },
  { b: 'i', wort: 'Igel',     bild: '🦔', laut: 'i' },
  { b: 'j', wort: 'Jacke',    bild: '🧥', laut: 'ja' },
  { b: 'k', wort: 'Katze',    bild: '🐱', laut: 'ka' },
  { b: 'l', wort: 'Löwe',     bild: '🦁', laut: 'lll' },
  { b: 'm', wort: 'Maus',     bild: '🐭', laut: 'mmm' },
  { b: 'n', wort: 'Nashorn',  bild: '🦏', laut: 'nnn' },
  { b: 'o', wort: 'Oktopus',  bild: '🐙', laut: 'o' },
  { b: 'p', wort: 'Pilz',     bild: '🍄', laut: 'pi' },
  { b: 'q', wort: 'Qualle',   bild: '🪼', laut: 'kwa' },
  { b: 'r', wort: 'Rakete',   bild: '🚀', laut: 'rrr' },
  { b: 's', wort: 'Sonne',    bild: '☀️', laut: 'sss' },
  { b: 't', wort: 'Tomate',   bild: '🍅', laut: 'to' },
  { b: 'u', wort: 'Uhr',      bild: '⏰', laut: 'u' },
  { b: 'v', wort: 'Vogel',    bild: '🐦', laut: 'fff' },
  { b: 'w', wort: 'Wal',      bild: '🐳', laut: 'www' },
  { b: 'x', wort: 'Xylophon', bild: 'bilder/xylophon.svg', laut: 'ks' },
  { b: 'y', wort: 'Yak',      bild: 'bilder/yak.svg', laut: 'ja' },
  { b: 'z', wort: 'Zebra',    bild: '🦓', laut: 'ze' },
  { b: 'ä', wort: 'Äpfel',    bild: '🍎🍏', laut: 'ä' },
  { b: 'ö', wort: 'Öl',       bild: '🛢️', laut: 'ö' },
  { b: 'ü', wort: 'Überraschung', bild: '🎁', laut: 'ü' },
  { b: 'ß', wort: 'Fuß',      bild: '🦶', laut: 'sss' },
];

// Dateinamen ohne Umlaute, damit Audiodateien überall sicher geladen werden
function dateiName(b) {
  return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[b] || b;
}
