// Deutsches Alphabet mit Anlaut-Wort und Bild (Emoji).
// "laut" ist das, was die Sprachausgabe als Notlösung spricht (Montessori: Laut statt Buchstabenname).
// Bei x und ß gibt es kein kindgerechtes Wort mit dem Laut am Anfang – dort steckt er im Wort.
const BUCHSTABEN = [
  { b: 'a', wort: 'Apfel',    bild: '🍎', laut: 'a' },
  { b: 'ä', wort: 'Äpfel',    bild: '🍎🍏', laut: 'ä' },
  { b: 'b', wort: 'Banane',   bild: '🍌', laut: 'ba' },
  { b: 'c', wort: 'Computer', bild: '💻', laut: 'ko' },
  { b: 'd', wort: 'Dino',     bild: '🦕', laut: 'di' },
  { b: 'e', wort: 'Ente',     bild: '🦆', laut: 'e' },
  { b: 'f', wort: 'Fisch',    bild: '🐟', laut: 'fff' },
  { b: 'g', wort: 'Gurke',    bild: '🥒', laut: 'gu' },
  { b: 'h', wort: 'Hund',     bild: '🐶', laut: 'hu' },
  { b: 'i', wort: 'Igel',     bild: '🦔', laut: 'i' },
  { b: 'j', wort: 'Jacke',    bild: '🧥', laut: 'ja' },
  { b: 'k', wort: 'Katze',    bild: '🐱', laut: 'ka' },
  { b: 'l', wort: 'Löwe',     bild: '🦁', laut: 'lll' },
  { b: 'm', wort: 'Maus',     bild: '🐭', laut: 'mmm' },
  { b: 'n', wort: 'Nase',     bild: '👃', laut: 'nnn' },
  { b: 'o', wort: 'Oktopus',  bild: '🐙', laut: 'o' },
  { b: 'ö', wort: 'Öl',       bild: '🛢️', laut: 'ö' },
  { b: 'p', wort: 'Pinguin',  bild: '🐧', laut: 'pi' },
  { b: 'q', wort: 'Qualle',   bild: '🪼', laut: 'kwa' },
  { b: 'r', wort: 'Rakete',   bild: '🚀', laut: 'rrr' },
  { b: 's', wort: 'Sonne',    bild: '☀️', laut: 'sss' },
  { b: 'ß', wort: 'Fuß',      bild: '🦶', laut: 'sss' },
  { b: 't', wort: 'Tomate',   bild: '🍅', laut: 'to' },
  { b: 'u', wort: 'Uhr',      bild: '⏰', laut: 'u' },
  { b: 'ü', wort: 'Überraschung', bild: '🎁', laut: 'ü' },
  { b: 'v', wort: 'Vogel',    bild: '🐦', laut: 'fff' },
  { b: 'w', wort: 'Wal',      bild: '🐳', laut: 'www' },
  { b: 'x', wort: 'Taxi',     bild: '🚕', laut: 'ks' },
  { b: 'y', wort: 'Yo-Yo',    bild: '🪀', laut: 'jo' },
  { b: 'z', wort: 'Zebra',    bild: '🦓', laut: 'ze' },
];

// Dateinamen ohne Umlaute, damit Audiodateien überall sicher geladen werden
function dateiName(b) {
  return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[b] || b;
}
