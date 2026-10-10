// Reim-Paare: zwei Wörter, die sich reimen (gleich viele Silben, sauberer Reim, eindeutiges Bild).
// Wort: [id, Wort ohne Artikel, Emoji, Audio-Datei]. Vorhandene Wörter aus letters.js nutzen deren Datei,
// neue liegen in audio/reim-<id>.wav. vokal = betonter Vokal: Ablenker haben nie denselben Vokal und nie denselben Anlaut,
// sonst wählt das Kind nach Klang-Ähnlichkeit statt nach dem Reim.
const REIME = [
  { stufe: 'leicht', vokal: 'au', woerter: [['maus', 'Maus', '🐭', 'audio/m-wort.wav'], ['haus', 'Haus', '🏠', 'audio/h-2-wort.wav']] },
  { stufe: 'leicht', vokal: 'a', woerter: [['hase', 'Hase', '🐰', 'audio/h-3-wort.wav'], ['nase', 'Nase', '👃', 'audio/n-2-wort.wav']] },
  { stufe: 'leicht', vokal: 'u', woerter: [['kuh', 'Kuh', '🐮', 'audio/k-wort.wav'], ['schuh', 'Schuh', '👟', 'audio/reim-schuh.wav']] },
  { stufe: 'leicht', vokal: 'u', woerter: [['hund', 'Hund', '🐶', 'audio/h-wort.wav'], ['mund', 'Mund', '👄', 'audio/reim-mund.wav']] },
  { stufe: 'leicht', vokal: 'o', woerter: [['rose', 'Rose', '🌹', 'audio/r-3-wort.wav'], ['hose', 'Hose', '👖', 'audio/reim-hose.wav']] },
  { stufe: 'leicht', vokal: 'a', woerter: [['wal', 'Wal', '🐳', 'audio/w-wort.wav'], ['schal', 'Schal', '🧣', 'audio/reim-schal.wav']] },
  { stufe: 'mittel', vokal: 'ei', woerter: [['bein', 'Bein', '🦵', 'audio/reim-bein.wav'], ['schwein', 'Schwein', '🐖', 'audio/reim-schwein.wav']] },
  { stufe: 'mittel', vokal: 'o', woerter: [['socke', 'Socke', '🧦', 'audio/s-3-wort.wav'], ['glocke', 'Glocke', '🔔', 'audio/reim-glocke.wav']] },
  { stufe: 'mittel', vokal: 'i', woerter: [['igel', 'Igel', '🦔', 'audio/i-wort.wav'], ['spiegel', 'Spiegel', '🪞', 'audio/reim-spiegel.wav']] },
  { stufe: 'mittel', vokal: 'i', woerter: [['fliege', 'Fliege', '🪰', 'audio/reim-fliege.wav'], ['ziege', 'Ziege', '🐐', 'audio/reim-ziege.wav']] },
  { stufe: 'mittel', vokal: 'i', woerter: [['pinsel', 'Pinsel', '🖌️', 'audio/reim-pinsel.wav'], ['insel', 'Insel', '🏝️', 'audio/i-2-wort.wav']] },
  { stufe: 'mittel', vokal: 'ei', woerter: [['eis', 'Eis', '🍦', 'audio/reim-eis.wav'], ['reis', 'Reis', '🍚', 'audio/reim-reis.wav']] },
];

// Anlaut fürs Ablenker-Verbot (sch zählt als ein Laut)
const reimAnlaut = (wort) => (/^sch/i.test(wort) ? 'sch' : wort[0].toLowerCase());
