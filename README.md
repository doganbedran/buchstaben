# Buchstaben-Spuren

Montessori-inspirierte Lern-App für Kinder ab 3: Buchstaben mit dem Finger nachspuren, Anlaut hören („mmm … wie Maus“), Sterne sammeln.
Läuft im Browser als installierbare App (PWA), offline, ohne Werbung und ohne Tracking.

## Dateien
- `letters.js` – Buchstaben, Wörter, Bilder, Laute (hier neue Wörter eintragen)
- `striche.js` – Strichfolge in Schreibrichtung (Vierlinien-System) für geführtes Nachspuren; Buchstaben ohne Eintrag nutzen die Schrift + Flächenprüfung
- `app.js` – Logik (Nachspuren, Prüfung, Sprache, Elternbereich)
- `style.css`, `index.html` – Oberfläche
- `sw.js`, `manifest.webmanifest`, `icons/` – Installation & Offline
- `bilder/` – eigene Zeichnungen, wo es kein Emoji gibt (Xylophon, Yak)
- `_test.html` – Test der Spur-Erkennung inkl. geführtem Nachspuren (grüne Leiste = OK; `#A`, `#a`, `#m`, `#H` wählt den gezeigten Buchstaben)
- `_test_profile.html` – Test der Profile inkl. Lob (in einem frischen Browserprofil öffnen, grüne Leiste = OK)
- `_test_kinder.html` – Test der Kinder-Profile (frisches Browserprofil; Ansicht per `#wer`, `#home`, `#kind`, `#eltern`)
- `werkzeuge/testseiten_erzeugen.sh` – Testseiten nach Änderungen an `index.html` neu erzeugen

## Lokal starten
    .venv/bin/python werkzeuge/testserver.py 8765     # oder: python3 -m http.server 8765
Dann http://localhost:8765 öffnen.

## Elternbereich
Zahnrad oben rechts **2 Sekunden gedrückt halten**. Dort: Profile, große/kleine Buchstaben, Sterne zurücksetzen.

**Kinder:** Jedes Kind hat Namen, Erkennungsbild (Tier oder Foto), eigene Sterne, eigene Schrift und ein
zugewiesenes Profil. Mit Kindern startet die App mit „Wer spielt?“. Ohne Kinder gelten die Einstellungen app-weit.

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
