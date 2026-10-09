// Wörterkiste: Themen-Kisten für Wortschatz und Erzählen (Montessori-Nomenklatur).
// Jedes Wort wird MIT Artikel eingesprochen (audio/kiste-<id>.wav, „die Tasse“) – darum fragt die App „Wo ist …“.
// Nur Einzahl (sonst bräuchte es „Wo sind …“). Tierlaute für „Wie macht …?“ in audio/tier-<id>.wav.
// stufe4: 'bei-dir' = „Wo ist bei dir …?“ (zeigen/holen), 'tiere' = „Wie macht …?“ (nachmachen), null = keine.
// Wort: [id, mit Artikel, Emoji, Frage für die Eltern]; das Erzähl-Bild zeigt die Fragen der drei Wörter der Runde
// (benennen → wozu → eigenes Erleben, wie beim dialogischen Vorlesen); beispiel = wie man die Antwort erweitert.
const KISTEN = [
  { id: 'koerper', name: 'Mein Körper', bild: '✋', beispiel: '„Ja, mit der Nase riechst du die Blumen.“', stufe4: 'bei-dir', woerter: [
    ['nase', 'die Nase', '👃', 'Was riechst du gern?'], ['ohr', 'das Ohr', '👂', 'Was hörst du gerade?'], ['mund', 'der Mund', '👄', 'Was machst du mit dem Mund?'],
    ['hand', 'die Hand', '✋', 'Was machst du mit den Händen?'], ['fuss', 'der Fuß', '🦶', 'Wohin laufen deine Füße am liebsten?'], ['auge', 'das Auge', '👁️', 'Welche Farbe haben deine Augen?']] },
  { id: 'fruehstueck', name: 'Frühstück', bild: '🥣', beispiel: '„Ja, die Kuh gibt Milch.“', stufe4: 'bei-dir', woerter: [
    ['loeffel', 'der Löffel', '🥄', 'Was isst du mit dem Löffel?'], ['tasse', 'die Tasse', '☕', 'Was trinkst du aus der Tasse?'], ['schuessel', 'die Schüssel', '🥣', 'Was kommt in die Schüssel?'],
    ['brot', 'das Brot', '🍞', 'Was magst du auf dem Brot?'], ['ei', 'das Ei', '🥚', 'Wo kommt das Ei her?'], ['milch', 'die Milch', '🥛', 'Wer gibt uns die Milch?']] },
  { id: 'bad', name: 'Bad', bild: '🛁', beispiel: '„Ja, mit der Seife waschen wir die Hände.“', stufe4: 'bei-dir', woerter: [
    ['zahnbuerste', 'die Zahnbürste', '🪥', 'Wann putzt du dir die Zähne?'], ['seife', 'die Seife', '🧼', 'Wie riecht deine Seife?'], ['badewanne', 'die Badewanne', '🛁', 'Was spielst du in der Badewanne?'],
    ['dusche', 'die Dusche', '🚿', 'Ist die Dusche warm oder kalt?'], ['toilette', 'die Toilette', '🚽', 'Was machst du nach der Toilette?'], ['schwamm', 'der Schwamm', '🧽', 'Was macht man mit dem Schwamm?']] },
  { id: 'bauernhof', name: 'Bauernhof', bild: '🚜', beispiel: '„Ja, das Huhn legt Eier – jeden Tag.“', stufe4: 'tiere', woerter: [
    ['kuh', 'die Kuh', '🐄', 'Was gibt uns die Kuh?'], ['schwein', 'das Schwein', '🐖', 'Wo schläft das Schwein?'], ['schaf', 'das Schaf', '🐑', 'Was wächst dem Schaf auf dem Rücken?'],
    ['pferd', 'das Pferd', '🐴', 'Hast du schon mal ein Pferd gestreichelt?'], ['huhn', 'das Huhn', '🐔', 'Was legt das Huhn?'], ['traktor', 'der Traktor', '🚜', 'Was macht der Traktor auf dem Feld?']] },
  { id: 'strasse', name: 'Straße', bild: '🚦', beispiel: '„Ja, bei Rot bleiben wir stehen.“', stufe4: null, woerter: [
    ['auto', 'das Auto', '🚗', 'Wohin fahrt ihr mit dem Auto?'], ['bus', 'der Bus', '🚌', 'Wer fährt den Bus?'], ['fahrrad', 'das Fahrrad', '🚲', 'Kannst du schon Fahrrad fahren?'],
    ['ampel', 'die Ampel', '🚦', 'Was macht die Ampel bei Rot?'], ['feuerwehrauto', 'das Feuerwehrauto', '🚒', 'Wohin fährt das Feuerwehrauto?'], ['roller', 'der Roller', '🛴', 'Wo fährst du gern Roller?']] },
];

// Tierlaute für „Wie macht …?“ (Text = was eingesprochen wird)
const TIERLAUTE = { kuh: 'Muuh', schwein: 'Grunz grunz', schaf: 'Mäh', pferd: 'Wiiiher', huhn: 'Gack gack', traktor: 'Brumm brumm' };

// Nicht in dieselbe Runde: zu ähnlich (Kind soll unterscheiden können)
const KISTEN_NICHT_ZUSAMMEN = [['badewanne', 'dusche'], ['tasse', 'schuessel'], ['tasse', 'milch'], ['loeffel', 'schuessel']];

const kisteDatei = (id) => `audio/kiste-${id}.wav`;
const tierDatei = (id) => `audio/tier-${id}.wav`;
