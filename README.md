# Buchstaben-Spuren

Montessori-inspirierte Lern-App für Kinder ab 3: Buchstaben mit dem Finger nachspuren, Anlaut hören („mmm … wie Maus“), Sterne sammeln.
Läuft im Browser als installierbare App (PWA), offline, ohne Werbung und ohne Tracking.

**Ausprobieren:** https://doganbedran.github.io/buchstaben/ – im Browser öffnen, auf dem Handy „Zum Startbildschirm
hinzufügen“. Kostenlos, ohne Werbung, ohne Konto; alle Daten (Kinder, Fotos, Aufnahmen) bleiben auf dem Gerät.
Elternbereich: ⚙️ oben rechts 2 Sekunden halten. Fragen und Ideen gern als Issue hier auf GitHub.

## Lizenz
- Programmcode und eigene Zeichnungen (`bilder/`): [GNU AGPL 3.0](LICENSE)
- Aufnahmen des Sprechers (`audio/`, Liste in `audio/sprecher.json`): CC BY-NC-ND 4.0 – siehe [audio/LIZENZ.md](audio/LIZENZ.md)
- Vorläufige Aufnahmen: Piper „Thorsten“ (Datensatz CC0, Modell MIT)

## Dateien
- `reime.js` – Reim-Paare (Wörter, Emoji, Audio, betonter Vokal)
- `ansagen.js` – Texte aller Ansagen (eine Quelle für App, Studios, Offline-Speicher und Piper)
- `letters.js` – Buchstaben, Wörter, Bilder, Laute (hier neue Wörter eintragen)
- `striche.js` – Strichfolge in Schreibrichtung (Vierlinien-System) für alle Buchstaben, groß und klein; daraus werden Vorlage, Kacheln und Prüfung gebaut (Zeichen ohne Eintrag nutzen die Schrift + Flächenprüfung)
- `_striche.html` – Übersicht aller Buchstaben mit Strich-Nummern und Richtung (zum Prüfen von Formen)
- `app.js` – Logik (Nachspuren, Prüfung, Sprache, Elternbereich)
- `style.css`, `index.html` – Oberfläche
- `sw.js`, `manifest.webmanifest`, `icons/` – Installation & Offline
- `bilder/` – eigene Zeichnungen, wo es kein Emoji gibt (Xylophon, Yak)
- `tests/<name>.js` – Tests (grüne Leiste unten = OK); `werkzeuge/testseiten_erzeugen.sh` baut daraus mit der aktuellen
  `index.html` die Seiten `tests/<name>.html` (nicht im Repo). Einzeln im Browser öffnen, z. B. http://localhost:8765/tests/silben.html
  - `spur` – Spur-Erkennung inkl. geführtem Nachspuren (`#A`, `#a`, `#m`, `#H` wählt den gezeigten Buchstaben)
  - `profile`, `kinder` (Ansicht `#wer`, `#home`, `#kind`, `#eltern`), `sichern`, `woerter` (`#eltern`, `#spuren`) – frisches Browserprofil
  - `startseite` – Startseite nur mit Spielen, Weg ✏️ → Buchstaben → Nachspuren → zurück
  - `zeigen` – Drei-Stufen-Lektion (Auswahl, alle Stufen, Daneben, Ende)
  - `willkommen` – Begrüßung beim ersten Start
  - `studio` – Stimme einsprechen im Elternbereich (künstlicher Ton statt Mikrofon)
  - `kiste` – Wörterkiste (Auswahl, alle Stufen, Stufe 4, Erzähl-Bild)
  - `info` – Über die App & Datenschutz (Texte, Links, Zurück-Weg)
  - `reime` – Reim-Paare (Ablenker-Regel, Vormachen, Runden, 🔊-Rettung)
  - `regal` – Spiele-Regal app-weit und je Kind, Standard für neue/alte Kinder, Sicherung
  - `hoeren`, `silben`, `legen`, `jagd`, `farben`, `montessori`, `memory`, `album`, `name` – je ein Spiel/eine Funktion
- `werkzeuge/alle_tests.sh` – alle Tests auf einmal (Testserver muss laufen)

## Lokal starten
    .venv/bin/python werkzeuge/testserver.py 8765     # oder: python3 -m http.server 8765
Dann http://localhost:8765 öffnen.

## Erster Start
Auf einem neuen Gerät (keine Kinder, keine Profile, noch nie gespielt) erscheint einmal „Willkommen“ für die Eltern:
„Kind anlegen“ oder „Gleich spielen“ (Fortschritt geht beim späteren ersten Kind nicht verloren) und der Hinweis aufs
Zahnrad. Testseiten überspringen die Begrüßung (außer `tests/willkommen.js`).

## Elternbereich
Zahnrad oben rechts **2 Sekunden gedrückt halten**. Dort: Profile, große/kleine Buchstaben, Sterne zurücksetzen.

**Kinder:** Jedes Kind hat Namen, Erkennungsbild (Tier oder Foto), optional eine Aufnahme des Namens fürs Lob
(etwa jedes dritte Lob, nie zweimal hintereinander: „Toll gemacht! … Lina! … Apfel“; ohne Aufnahme kein Name), eigene Sterne, eigene Schrift und ein
zugewiesenes Profil. Mit Kindern startet die App mit „Wer spielt?“. Ohne Kinder gelten die Einstellungen app-weit.

**Stimme einsprechen** (eigenes Profil → „🎙️ Stimme einsprechen“): Laute, Wörter, Lob, Ansagen, Kisten und Silben am Handy einmal
einsprechen (🎙️ gedrückt halten). Die App schneidet die Stille ab, gleicht die Lautstärke an und nutzt die Aufnahme in
allen Spielen (Medien-Schlüssel `datei:<name>.wav` ersetzt `audio/<name>.wav`; „Laut … Laut … Wort“ wird aus den
Teilen zusammengesetzt). Je Stück oder Bereich auf Standard zurücksetzbar, alles auch in der Sicherung.

**Profile:** „Standard“ (Thorsten + mitgelieferte Bilder) ist immer da und unveränderlich. Eigene Profile
enthalten pro Buchstabe optional ein Foto und/oder eine Aufnahme; alles andere kommt aus „Standard“.
Fotos, Aufnahmen und Sterne bleiben nur auf dem jeweiligen Gerät (IndexedDB, an die Adresse gebunden).

## Stimme / Audio
Die Laute kommen als fertige Dateien aus `audio/`, erzeugt lokal mit Piper:

    .venv/bin/python werkzeuge/audio_erzeugen.py --stimme de_DE-thorsten-high --ziel audio

Eigene Aufnahmen im Elternbereich haben Vorrang vor den Dateien.

## Farben & Farbsehschwäche
Das geführte Nachspuren nutzt Blau (Startpunkt) + Orange (Pfeile): bleibt bei Rot-Grün-Schwäche unterscheidbar.
Wichtige Unterschiede stecken zusätzlich in der Helligkeit (WCAG-Kontrast):
Startpunkt/Strich 3,7 : 1 · Pfeile/Strich 3,3 : 1 · Zahl im Startpunkt 6,1 : 1 · Buchstaben-Umriss/Tafel 2,1 : 1.
Kachel-Buchstaben auf Weiß ≥ 3,2 : 1. Die Farben stehen in `FARBE` in `app.js`.

## Sichern & Übertragen
Elternbereich → „Sichern & Übertragen“: alle eigenen Profile (Fotos, Aufnahmen, Lob) und Kinder (Bild,
Namensaufnahme, Sterne, Einstellungen) als eine JSON-Datei speichern oder teilen (Android-Teilen-Menü)
und auf einem anderen Gerät einspielen. Einspielen ergänzt bzw. aktualisiert (gleiche ID), löscht nichts.
Die Datei enthält Fotos und Stimmen der Familie – nicht öffentlich ablegen.

## Spiele
Die Startseite zeigt nur große Spiel-Kacheln (ohne Scrollen); die Buchstaben gibt es erst nach ✏️.
Welche Spiele dort stehen, legen die Eltern je Kind fest (gespeichert wird, was ausgeblendet ist – neue Spiele erscheinen nach Updates von selbst) (Elternbereich → Kind → „Spiele im Regal“). Neue Kinder
beginnen mit ✏️ 👆 👂 🥁 ✍️ 📒 – ein neues Spiel erst ins Regal stellen, wenn man es zusammen ausprobiert hat.

- ✏️ **Nachspuren** – Buchstaben-Raster (eine Farbe, großes Bild, Sterne nur im Elternbereich); Reihenfolge pro Kind: Montessori (Standard für neue Kinder/Geräte; Gruppen m a s l → o i e n → …, nächste Gruppe ab 2 Sternen je Buchstabe – sichtbar sind nur die aktuelle Gruppe groß und die gelernten klein, noch nicht eingeführte gar nicht) oder A–Z (alles offen). Sterne je Buchstabe sehen die Eltern im Elternbereich unter „Fortschritt“
- 🧺 **Wörterkiste** – Wortschatz nach Themen (`kisten.js`: Körper, Frühstück, Bad, Bauernhof, Straße; je 6 Wörter mit
  Artikel). Je Runde 3 Wörter: 👀 „Das ist …“ → 👂 „Wo ist …?“ → 🗣️ „Was ist das? Sag es!“ → 👉 „Wo ist bei dir …?“
  (zeigen/holen, 👍 oder Bild) bzw. 🎵 „Wie macht …?“ (Tierlaut). Danach ein Erzähl-Bild mit je einer Gesprächsfrage
  pro Wort für die Eltern; 🏠/🔁 erst nach 15 s. Auf dem Erzähl-Bild kann das Kind
  🎙️ seine Erzählung aufnehmen (bis 15 s, bleibt auf dem Gerät, gehört dem Kind wie die Jagd-Funde) – sie erscheint im
  Sticker-Album unter 💬.
  Eigene Fotos: Eltern-Studio → Kisten → 📷 – das Foto (z. B. eure echte Tasse) ersetzt das Emoji
  (Profil-Medium `datei:kiste-<id>.wav|bild`, gleicher Schlüssel wie die Aufnahme). Aufnahmen `audio/kiste-<id>.wav`, `audio/tier-<id>.wav`.
- 👆 **Zeig mir** – Montessori-Drei-Stufen-Lektion mit 3 Buchstaben (in Stufe 1 wird jeder Buchstabe nach dem Antippen
  einmal auf der Spur-Tafel nachgespurt – wie der Sandpapier-Buchstabe; ➡️ dort = ohne Spuren zurück, keine Sterne) (aktuelle Gruppe; nie ähnlich aussehend oder
  klingend, siehe `AEHNLICHE_FORMEN`/`AEHNLICHE_LAUTE`): 👀 „Das ist …“ → 👂 „Zeig mir …“ (6 Aufträge, Plätze einmal
  getauscht) → 🗣️ „Was ist das? Sag es!“ (Kind spricht, Tipp = Vergleich). Unsichere Buchstaben werden in Stufe 3
  nochmal vorgestellt. 🔊 wiederholt jederzeit den aktuellen Schritt.
- 🎨 **Fingerfarben** – Farbwahl beim Nachspuren (bunt, 6 Farben, Regenbogen, Glitzer), pro Kind gespeichert
- 📳 **Vibration** beim Nachspuren (Sandpapier-Gefühl, Android), im Elternbereich abschaltbar
- ✍️ **Mein Name** – eigenen Namen Buchstabe für Buchstabe nachspuren (nur mit ausgewähltem Kind)
- 🧩 **Groß & klein** – Memory mit 4 Paaren (A/a); gleich aussehende Paare (C/c, O/o …) und i+l zusammen ausgeschlossen
- 🔍 **Buchstaben-Jagd** – etwas mit dem Anlaut zu Hause finden, fotografieren, Wort aufnehmen; Funde im Album (pro Kind)
- 🔤 **Wörter legen** – bewegliches Alphabet: Bild + leere Felder, Buchstaben antippen; nur lautgetreue Wörter + persönliche Wörter
- 📒 **Sticker-Album** – pro geschafftem Buchstaben ein Sticker des gezeigten Wortes, Album pro Kind
- 👂 **Ich höre was** – Laut hören („mmm …“), passendes Bild von dreien antippen; 5 Runden. Ähnlich klingende
  Anlaute (f/v, k/c/q/x, e/ä, j/y) nie in derselben Runde, ß ausgenommen. Nutzt `audio/<b>-laut.wav`.
- 🎶 **Reim-Paare** – „Was reimt sich auf … Maus?“: Ziel-Bild oben, zwei Bilder unten (beide werden vorgesprochen).
  Einmal vorgemacht (Maus – Haus), dann 5 Runden (3 leichte, 2 mittlere Paare aus `reime.js`). Der Ablenker hat nie
  denselben betonten Vokal oder Anlaut wie das Ziel. Daneben: beide Wörter hören, das passende Bild pulsiert.
  Eher fürs 4-jährige Kind – steht nicht im Start-Regal. Neue Wörter in `audio/reim-<id>.wav`.
  Leichte Stufe „Reime nur hören“ (je Kind im Elternbereich): keine Auswahl – Paar hören, beide Bilder antippen,
  „Jetzt du!“ zum Mitsprechen.
- 🥁 **Silben-Trommel** – Wort hören, pro Silbe einmal auf die Trommel hauen (Silbenbögen erscheinen); die App
  spricht danach die Silben zu den Bögen. 5 Runden (2, 1, 2, 3, 3 Silben). Daneben: App trommelt vor, Kind nochmal;
  beim zweiten Mal gemeinsam. Wörter und Trennung in `SILBEN` (`letters.js`), Aufnahmen `audio/silbe-<wort>-<nr>.wav`
  (fehlt eine, trommelt die App ohne Stimme).
  👫 Zu zweit: zwei Trommeln nebeneinander, Geschwister hauen abwechselnd; Bögen der zweiten Trommel gestrichelt.

## Aufnahme-Studio (Sprecher-Stimme)
Testserver starten, dann http://localhost:8765/werkzeuge/aufnahme-studio.html öffnen (Mikrofon erlauben).
Bereiche: **Laute, Ansagen, Wörter, Lob, Kisten, Silben** – jedes Stück einmal sprechen; Leertaste = Aufnahme an/aus,
A = anhören, Enter = speichern. Das Studio schneidet die Stille ab, gleicht die Lautstärke an und baut die
zusammengesetzten Clips selbst („mmm“ → `m-laut.wav` = „mmm … mmm“, `m.wav` = „mmm … mmm … Maus“).
Silben: pro Wort einmal mit kleinen Pausen („Ba – na – ne“). Gespeichert wird über den Testserver
(`POST /_speichern`, nur von der Studio-Seite); `audio/sprecher.json` listet alle Dateien mit Sprecher-Stimme,
`audio_erzeugen.py` (Piper) überschreibt sie nie. Was noch nicht aufgenommen ist, spricht Piper „Thorsten“.

## Wörter
Jeder Buchstabe hat einen Wort-Vorrat: Hauptwort (`wort`/`bild`), weitere Standard-Wörter (`mehr` in `letters.js`,
Audio `audio/<b>-2.wav`, `-2-wort.wav` …) und persönliche Wörter des Profils (Elternbereich → „➕ eigenes Wort“,
mit Foto und eigener Aufnahme; gespeichert in `profil.woerter`, Medien unter `w-<id>`). Beim Öffnen eines
Buchstabens und im Hör-Spiel wird zufällig gewählt, persönliche Wörter zählen dreifach.
Neue Standard-Wörter: in `mehr` eintragen, dann `audio_erzeugen.py … --teile mehr`.
