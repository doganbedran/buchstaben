# Buchstaben-Spuren

Montessori-inspirierte Lern-App für Kinder ab 3: Buchstaben mit dem Finger nachspuren, Anlaut hören („mmm … wie Maus“), Sterne sammeln.
Läuft im Browser als installierbare App (PWA), offline, ohne Werbung und ohne Tracking.

## Dateien
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
  - `regal` – Spiele-Regal app-weit und je Kind, Standard für neue/alte Kinder, Sicherung
  - `hoeren`, `silben`, `legen`, `jagd`, `farben`, `montessori`, `memory`, `album`, `name` – je ein Spiel/eine Funktion
- `werkzeuge/alle_tests.sh` – alle Tests auf einmal (Testserver muss laufen)

## Lokal starten
    .venv/bin/python werkzeuge/testserver.py 8765     # oder: python3 -m http.server 8765
Dann http://localhost:8765 öffnen.

## Elternbereich
Zahnrad oben rechts **2 Sekunden gedrückt halten**. Dort: Profile, große/kleine Buchstaben, Sterne zurücksetzen.

**Kinder:** Jedes Kind hat Namen, Erkennungsbild (Tier oder Foto), optional eine Aufnahme des Namens fürs Lob
(etwa jedes dritte Lob, nie zweimal hintereinander: „Toll gemacht! … Lina! … Apfel“; ohne Aufnahme kein Name), eigene Sterne, eigene Schrift und ein
zugewiesenes Profil. Mit Kindern startet die App mit „Wer spielt?“. Ohne Kinder gelten die Einstellungen app-weit.

**Stimme einsprechen** (eigenes Profil → „🎙️ Stimme einsprechen“): Laute, Wörter und Lob am Handy einmal
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
- 👆 **Zeig mir** – Montessori-Drei-Stufen-Lektion mit 3 Buchstaben (aktuelle Gruppe; nie ähnlich aussehend oder
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
- 🥁 **Silben-Trommel** – Wort hören, pro Silbe einmal auf die Trommel hauen (Silbenbögen erscheinen); die App
  spricht danach die Silben zu den Bögen. 5 Runden (2, 1, 2, 3, 3 Silben). Daneben: App trommelt vor, Kind nochmal;
  beim zweiten Mal gemeinsam. Wörter und Trennung in `SILBEN` (`letters.js`), Aufnahmen `audio/silbe-<wort>-<nr>.wav`
  (fehlt eine, trommelt die App ohne Stimme).

## Aufnahme-Studio (Sprecher-Stimme)
Testserver starten, dann http://localhost:8765/werkzeuge/aufnahme-studio.html öffnen (Mikrofon erlauben).
Bereiche: **Laute, Ansagen, Wörter, Lob, Silben** – jedes Stück einmal sprechen; Leertaste = Aufnahme an/aus,
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
