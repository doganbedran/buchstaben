// Deutsches Alphabet mit Anlaut-Wort und Bild (Emoji): a–z, danach ä, ö, ü, ß.
// "laut" ist das, was die Sprachausgabe als Notlösung spricht (Montessori: Laut statt Buchstabenname).
// Beim ß gibt es kein Wort mit dem Laut am Anfang – dort steckt er im Wort.
// "bild" ist ein Emoji oder eine Datei in bilder/ (wo es kein passendes Emoji gibt).
// "mehr": weitere Wörter [Wort, Emoji] – nur mit sauberem Anlaut (nicht Giraffe/"Schiraffe", Eis/"ei", Vulkan/"W").
const BUCHSTABEN = [
  { b: 'a', wort: 'Apfel',    bild: '🍎', laut: 'a',   mehr: [['Affe', '🐒'], ['Ameise', '🐜']] },
  { b: 'b', wort: 'Banane',   bild: '🍌', laut: 'ba',  mehr: [['Ball', '⚽'], ['Bär', '🐻']] },
  { b: 'c', wort: 'Computer', bild: '💻', laut: 'ko',  mehr: [['Clown', '🤡'], ['Cowboy', '🤠']] },
  { b: 'd', wort: 'Delphin',  bild: '🐬', laut: 'de',  mehr: [['Dino', '🦕'], ['Drache', '🐉']] },
  { b: 'e', wort: 'Elefant',  bild: '🐘', laut: 'e',   mehr: [['Ente', '🦆'], ['Erdbeere', '🍓']] },
  { b: 'f', wort: 'Fisch',    bild: '🐟', laut: 'fff', mehr: [['Frosch', '🐸'], ['Fuchs', '🦊']] },
  { b: 'g', wort: 'Gitarre',  bild: '🎸', laut: 'gi',  mehr: [['Gurke', '🥒'], ['Gespenst', '👻']] },
  { b: 'h', wort: 'Hund',     bild: '🐶', laut: 'hu',  mehr: [['Haus', '🏠'], ['Hase', '🐰']] },
  { b: 'i', wort: 'Igel',     bild: '🦔', laut: 'i',   mehr: [['Insel', '🏝️']] },
  { b: 'j', wort: 'Jacke',    bild: '🧥', laut: 'ja',  mehr: [['Jojo', '🪀']] },
  { b: 'k', wort: 'Katze',    bild: '🐱', laut: 'ka',  mehr: [['Kuh', '🐮'], ['Käse', '🧀']] },
  { b: 'l', wort: 'Löwe',     bild: '🦁', laut: 'lll', mehr: [['Lama', '🦙'], ['Löffel', '🥄']] },
  { b: 'm', wort: 'Maus',     bild: '🐭', laut: 'mmm', mehr: [['Mond', '🌙'], ['Möhre', '🥕']] },
  { b: 'n', wort: 'Nashorn',  bild: '🦏', laut: 'nnn', mehr: [['Nase', '👃'], ['Nudeln', '🍝']] },
  { b: 'o', wort: 'Oktopus',  bild: '🐙', laut: 'o',   mehr: [['Ohr', '👂'], ['Orange', '🍊']] },
  { b: 'p', wort: 'Pilz',     bild: '🍄', laut: 'pi',  mehr: [['Pinguin', '🐧'], ['Pizza', '🍕']] },
  { b: 'q', wort: 'Qualle',   bild: '🪼', laut: 'kwa', mehr: [] },
  { b: 'r', wort: 'Rakete',   bild: '🚀', laut: 'rrr', mehr: [['Regenbogen', '🌈'], ['Rose', '🌹']] },
  { b: 's', wort: 'Sonne',    bild: '☀️', laut: 'sss', mehr: [['Sofa', '🛋️'], ['Socke', '🧦']] },
  { b: 't', wort: 'Tomate',   bild: '🍅', laut: 'to',  mehr: [['Tiger', '🐯'], ['Teddy', '🧸']] },
  { b: 'u', wort: 'Uhr',      bild: '⏰', laut: 'u',   mehr: [['Ufo', '🛸'], ['U-Bahn', '🚇']] },
  { b: 'v', wort: 'Vogel',    bild: '🐦', laut: 'fff', mehr: [['Vier', '4️⃣']] },
  { b: 'w', wort: 'Wal',      bild: '🐳', laut: 'www', mehr: [['Wolke', '☁️'], ['Wurm', '🪱']] },
  { b: 'x', wort: 'Xylophon', bild: 'bilder/xylophon.svg', laut: 'ks', mehr: [] },
  { b: 'y', wort: 'Yak',      bild: 'bilder/yak.svg', laut: 'ja', mehr: [['Yoga', '🧘']] },
  { b: 'z', wort: 'Zebra',    bild: '🦓', laut: 'ze',  mehr: [['Zug', '🚂'], ['Zitrone', '🍋']] },
  { b: 'ä', wort: 'Äpfel',    bild: '🍎🍏', laut: 'ä', mehr: [['Ähre', '🌾']] },
  { b: 'ö', wort: 'Öl',       bild: '🛢️', laut: 'ö',  mehr: [] },
  { b: 'ü', wort: 'Überraschung', bild: '🎁', laut: 'ü', mehr: [] },
  { b: 'ß', wort: 'Fuß',      bild: '🦶', laut: 'sss', mehr: [] },
];

// Dateinamen ohne Umlaute, damit Audiodateien überall sicher geladen werden
function dateiName(b) {
  return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[b] || b;
}
