# Buchstaben-Spuren – Arbeitsanweisung für Claude

Montessori-inspirierte Lern-App (PWA) für Kinder ab 3: Buchstaben in Schreibrichtung nachspuren, Anlaute hören,
kleine Spiele. Läuft offline im Browser, keine Cloud, kein Tracking. Live: https://doganbedran.github.io/buchstaben/
(GitHub Pages aus `main`, Repo ist **öffentlich**). Alles auf Deutsch: Oberfläche, Bezeichner, Kommentare, Commits.

## Wichtigste Regeln
- **Adresse nie ändern** (Domain/Pfad): Profile, Aufnahmen, Fotos, Sterne liegen in IndexedDB/localStorage und hängen an der Origin.
- **Nichts Privates ins Repo** (öffentlich): keine Namen, Fotos oder Aufnahmen der Familie, keine Sicherungsdateien.
- Keine Cloud-KI/-Dienste (z. B. Replicate) einbauen oder vorschlagen, außer der User fragt ausdrücklich.
- Zielgruppe 3–4 Jahre: große Knöpfe, keine Texte für Kinder, kein „falsch“ (sanft wackeln + Hinweis), Eltern-Funktionen hinter dem Zahnrad (2 s halten).
- Farben farbenblind-sicher: Blau (Startpunkt) + Orange (Pfeile), Unterschiede auch über Helligkeit (Werte in README).
- Wörter nur mit sauberem Anlaut; „Wörter legen“ nur lautgetreue Wörter.

## Arbeitsablauf je Änderung
1. Testserver starten (falls nicht läuft): `.venv/bin/python werkzeuge/testserver.py 8765 &`
2. Änderung bauen; bei neuer Funktion eine Testseite `_test_<name>.js` anlegen und in
   `werkzeuge/testseiten_erzeugen.sh` und `werkzeuge/alle_tests.sh` eintragen.
3. **`APP_VERSION` in `app.js` und `CACHE` in `sw.js` gemeinsam um 1 erhöhen** (sonst sehen Geräte das Update nicht).
   Neue Dateien, die offline gebraucht werden, in `DATEIEN` in `sw.js` aufnehmen.
4. `./werkzeuge/alle_tests.sh` – alle müssen OK sein (Ergebnis = grüne/rote Leiste unten im Screenshot).
5. Commit + `git push`; danach prüfen, dass `sw.js` live die neue Cache-Nummer hat.
6. Dem User kurz auf Deutsch berichten: was neu ist, was getestet wurde, was nur auf dem echten Handy prüfbar ist
   (Kamera, Mikrofon, Vibration, Finger).

## Team und Abläufe (`.claude/`)
- Rollen in `.claude/agents/`: `paedagogin`, `bildungsplan` (Berlin + Bayern/Sachsen + Studienlage), `kinderpsychologin`,
  `ux-kinder`, `testerin`, `reviewer`, `datenschutz`, `kinder-tester` – Befunde jeweils als Muss / Sollte / Idee.
- `/neuer-inhalt` – größere Inhalte mit dem ganzen Team (Ideen → Gestaltung → Bauen → Prüfen → Veröffentlichen → Checkliste).
- `/veroeffentlichen` – Version + Cache, alle Tests, Commit, Push, Live-Prüfung, Bericht.
- Kleine Korrekturen ohne Team; echte Beobachtungen der Kinder haben Vorrang vor dem virtuellen Team.

## Struktur
- `index.html`, `style.css`, `app.js` – die ganze App (keine Build-Schritte, keine Abhängigkeiten)
- `letters.js` – Alphabet: `wort`/`bild`/`laut` + weitere Wörter `mehr`; `dateiName()` (ä→ae, ö→oe, ü→ue, ß→ss)
- `striche.js` – Strichfolge aller 60 Zeichen (Vierlinien-System y: 0 Ober-, 50 Mittel-, 100 Grund-, 140 Unterlinie);
  `_striche.html` zeigt alle mit Nummern/Richtung zur Kontrolle
- `sw.js` – Offline-Cache (network-first mit `cache: 'no-cache'`, GitHub Pages cached sonst 10 min)
- `audio/` – Thorstens Clips: `<b>.wav`, `<b>-wort.wav`, `<b>-laut.wav`, `<b>-2.wav`…, `lob-*.wav`, `ansage-*.wav`
- `bilder/` – eigene SVGs, wo es kein Emoji gibt (Xylophon, Yak)
- `werkzeuge/` – `audio_erzeugen.py`, `testserver.py`, `alle_tests.sh`, `testseiten_erzeugen.sh`

## Daten (nur auf dem Gerät)
- IndexedDB `lernapp` (Version 3): `profile` (eigene Stimm-/Bildprofile inkl. `woerter`), `medien` (Blobs, Schlüssel
  `<profil>|<b oder w-id oder lob-n>|bild|stimme`, Funde `fund-<kind>|<id>|…`), `kinder` (Name, Tier/Foto,
  Namensaufnahme, sterne, schreibweise, profil, album, reihenfolge, farbe, funde), `aufnahmen` (alt, nur Migration).
- localStorage: App-weite Einstellungen ohne Kinder (`schreibweise`, `sterne`, `profil`, `album`, …), aktives `kind`.
- Profil „Standard“ ist kein DB-Eintrag und unveränderlich. Pro Buchstabe: Eigenes > Standard.
- Sicherung (Elternbereich) = JSON mit Profilen, Medien, Kindern, Funden; Einspielen ergänzt nach ID, löscht nichts.
  Neue Felder an Kindern/Einstellungen auch in `einstellungenLaden/-Speichern`, beim ersten Kind und in der Sicherung ergänzen.

## Audio (Piper, lokal)
- Stimme `de_DE-thorsten-high` in `.stimmen/` (nicht im Repo); andere deutsche Piper-Stimmen hat der User als unbrauchbar bewertet.
- `.venv` hat Piper (pip wurde per get-pip.py ins venv geholt, System hat kein pip).
- Piper klingt bei jedem Lauf etwas anders: **nur neue Dateien erzeugen**, bestehende nicht überschreiben.
  `--teile` wählt Teile (buchstaben, laute, mehr, lob, ansagen). Neue Ansage: in `ANSAGEN` eintragen, in einen
  Zwischenordner erzeugen (`--ziel` außerhalb von `audio/`) und nur die neue Datei nach `audio/` kopieren.
- Aussprache-Hilfen in `SPRECHEN` (z. B. Clown → Klaun). Laute als Lautschrift in `LAUTE`.

## Testen – Stolperfallen
- Firefox ist ein Snap: Profile/Screenshots nur unter `~/snap/firefox/common/lernapp-test/` (nicht /tmp).
- Bildprüfung mit System-`python3` (hat PIL), nicht mit `.venv`.
- Testserver stoppen über die Portnummer: `kill $(ss -ltnpH 'sport = :8765' | grep -o 'pid=[0-9]*' | cut -d= -f2)` –
  **nicht** `pkill -f http.server…` im selben Befehl wie das Starten (beendet die eigene Shell).
- Asynchrone Tests: Testseiten binden `/_warten?ms=…` als iframe ein, damit der Screenshot erst danach entsteht;
  auf `startFertig` warten statt feste Wartezeiten.
- Chrome zeichnet Linien der Länge 0 nicht → einzelne Punkte als gefüllte Kreise malen (`spurStueck`).
- Grid-Zeilen mit Seitenverhältnis-Kacheln + Fotos rechnet Firefox falsch → feste Kachelgrößen (siehe `.album-funde`).
