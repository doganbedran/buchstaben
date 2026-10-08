# Buchstaben-Spuren

Montessori-inspirierte Lern-App für Kinder ab 3: Buchstaben mit dem Finger nachspuren, Anlaut hören („mmm … wie Maus“), Sterne sammeln.
Läuft im Browser als installierbare App (PWA), offline, ohne Werbung und ohne Tracking.

## Dateien
- `letters.js` – Buchstaben, Wörter, Bilder, Laute (hier neue Wörter eintragen)
- `app.js` – Logik (Nachspuren, Prüfung, Sprache, Elternbereich)
- `style.css`, `index.html` – Oberfläche
- `sw.js`, `manifest.webmanifest`, `icons/` – Installation & Offline
- `_test.html` – automatischer Test der Spur-Erkennung (lokal öffnen, unten steht „ALLE TESTS OK“)

## Lokal starten
    python3 -m http.server 8765
Dann http://localhost:8765 öffnen.

## Elternbereich
Zahnrad oben rechts **2 Sekunden gedrückt halten**. Dort: große/kleine Buchstaben, eigene Stimme aufnehmen, Sterne zurücksetzen.
Aufnahmen und Sterne bleiben nur auf dem jeweiligen Gerät.

## Stimme / Audio
Die Laute kommen als fertige Dateien aus `audio/`, erzeugt lokal mit Piper:

    .venv/bin/python werkzeuge/audio_erzeugen.py --stimme de_DE-thorsten-high --ziel audio

Eigene Aufnahmen im Elternbereich haben Vorrang vor den Dateien.
