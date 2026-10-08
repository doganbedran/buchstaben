# Buchstaben-Spuren

Montessori-inspirierte Lern-App für Kinder ab 3: Buchstaben mit dem Finger nachspuren, Anlaut hören („mmm … wie Maus“), Sterne sammeln.
Läuft im Browser als installierbare App (PWA), offline, ohne Werbung und ohne Tracking.

## Dateien
- `letters.js` – Buchstaben, Wörter, Bilder, Laute (hier neue Wörter eintragen)
- `app.js` – Logik (Nachspuren, Prüfung, Sprache, Elternbereich)
- `style.css`, `index.html` – Oberfläche
- `sw.js`, `manifest.webmanifest`, `icons/` – Installation & Offline
- `bilder/` – eigene Zeichnungen, wo es kein Emoji gibt (Xylophon, Yak)
- `_test.html` – Test der Spur-Erkennung (unten steht „ALLE TESTS OK“)
- `_test_profile.html` – Test der Profile (in einem frischen Browserprofil öffnen, unten „PROFIL-TESTS OK“)

## Lokal starten
    .venv/bin/python werkzeuge/testserver.py 8765     # oder: python3 -m http.server 8765
Dann http://localhost:8765 öffnen.

## Elternbereich
Zahnrad oben rechts **2 Sekunden gedrückt halten**. Dort: Profile, große/kleine Buchstaben, Sterne zurücksetzen.

**Profile:** „Standard“ (Thorsten + mitgelieferte Bilder) ist immer da und unveränderlich. Eigene Profile
enthalten pro Buchstabe optional ein Foto und/oder eine Aufnahme; alles andere kommt aus „Standard“.
Fotos, Aufnahmen und Sterne bleiben nur auf dem jeweiligen Gerät (IndexedDB, an die Adresse gebunden).

## Stimme / Audio
Die Laute kommen als fertige Dateien aus `audio/`, erzeugt lokal mit Piper:

    .venv/bin/python werkzeuge/audio_erzeugen.py --stimme de_DE-thorsten-high --ziel audio

Eigene Aufnahmen im Elternbereich haben Vorrang vor den Dateien.
