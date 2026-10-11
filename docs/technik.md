# Wortnest – Technik

Aufbau, Daten und Tests. Betrieb und Veröffentlichen: [betrieb.md](betrieb.md).

## Aufbau
Reines HTML/CSS/JavaScript, keine Abhängigkeiten, kein Build-Schritt. Installierbare Web-App (PWA) auf GitHub Pages.

| Datei | Inhalt |
|---|---|
| `index.html` | alle Bildschirme (`<section class="screen">`, Elternbereich mit Klasse `eltern`) |
| `style.css` | Oberfläche; Farb-Variablen in `:root`; `@font-face` für Andika |
| `app.js` | die ganze Logik (Speicher, Kinder, Menschen, Spiele, Studio, Sicherung, Mitmachen, Pause) |
| `letters.js` | Buchstaben: `wort`, `bild`, `laut`, weitere Wörter `mehr`, Silben `SILBEN`; `dateiName()` (ä→ae …) |
| `striche.js` | Strichfolge aller 60 Zeichen im Vierlinien-System (y: 0 Ober-, 50 Mittel-, 100 Grund-, 140 Unterlinie) |
| `kisten.js` | Wörterkiste: Themen, Wörter mit Artikel, Fragen für Eltern, Tierlaute |
| `reime.js` | Reim-Paare (Wort, Emoji, Audio, betonter Vokal) |
| `ansagen.js` | Texte aller Ansagen (eine Quelle für App, Studios, Offline-Speicher, Piper) |
| `sw.js` | Offline-Speicher |
| `manifest.webmanifest`, `icons/` | Installation, Symbol (das „a“ im Nest) |
| `audio/` | Tondateien; `sprecher.json` = Dateien mit Sprecher-Stimme |
| `bilder/` | eigene SVGs, wo es kein Emoji gibt (Xylophon, Yak) |
| `fonts/` | Andika (latin + latin-ext, 400/700), `OFL.txt` |
| `_striche.html` | Kontrollseite: alle Buchstaben mit Strich-Nummern und Richtung |
| `werkzeuge/` | Testserver, Tests, Piper-Skript, Aufnahme-Studio |

## Daten (nur auf dem Gerät)
**IndexedDB `lernapp`, Version 3** (Format für Zahlennest festgelegt: [datenvertrag.md](datenvertrag.md)):
- `kinder` (keyPath `id`, `k-…`): Name, Tier oder `foto` (Blob), `nameStimme` (Blob), `sterne`, `schreibweise`,
  `reihenfolge`, `farbe`, `profil` (Hauptstimme), `lobGaeste`, `album`, `funde`, `spieleAus`, `reimHoeren`.
- `profile` (keyPath `id`, `p-…`) = „Menschen“: Name, `woerter` (persönliche Wörter), `kistenWoerter` (Meine
  Leute/Kita, `name: true` = auch bei ✍️ Mein Name).
- `medien` (Schlüssel `<profil>|<platz>|<bild|stimme>`, Wert = Blob). Plätze: Buchstabe, `w-<id>`, `lob-1…5`,
  `ich` (Foto der Person), `datei:<name>.wav` (Studio, ersetzt `audio/<name>.wav`). Funde des Kindes:
  `fund-<kind>|<id>|…`; Erzählungen der Wörterkiste stehen als `art: 'erzaehlung'` in `funde`.
- `aufnahmen`: alt, nur noch zur Umwandlung.

Profil „Standard“ ist kein Eintrag und unveränderlich. Pro Buchstabe gilt: Eigenes vor Standard.

**localStorage** (ohne Präfix; Zahlennest nutzt `zn:`): `kind` (aktives Kind), app-weite Einstellungen ohne Kinder
(`schreibweise`, `sterne`, `profil`, `album`, `funde`, `reihenfolge`, `farbe`, `reimHoeren`, `spieleAus`), dazu
`vibration`, `zuZweit`, `willkommen`, `studioHinweis`, `letzteSicherung`. Gemeinsam mit Zahlennest: `nest:spielzeit`
(`{ ms, letzte, tag, heute }`), `nest:pauseNach` (Minuten), `nest:pauseAm` (Zeitpunkt).
Neues Gerät = kein `sterne` im localStorage → Montessori-Reihenfolge und kleines Regal (`START_REGAL`).

## Offline-Speicher (`sw.js`)
- Network-first: mit Internet immer frisch (`cache: 'no-cache'` umgeht den 10-Minuten-Cache von GitHub Pages),
  ohne Internet aus dem Cache. Cache-Name `buchstaben-v<APP_VERSION>`.
- Installation lädt `DATEIEN` (App, Töne, Bilder, Schrift) mit `addAll` – **keine doppelten Einträge** (sonst scheitert
  die Installation still); Silben-Aufnahmen mit `allSettled` (fehlende verhindern nichts).
- Beim Aktivieren werden nur eigene alte Caches (`buchstaben-…`) gelöscht.
- In `importScripts` jede Datei nur einmal (sonst „redeclaration of const“ → keine Installation; Test `offline`).
- Auf der Mitmach-Seite wird kein Service Worker angemeldet (Oma soll keine 18 MB laden).

## Schutz gegen Angriffe
- **Sicherheitsregel (Content Security Policy)** als `<meta>` in `index.html`: Skripte, Stile, Schriften, Bilder, Töne
  und Verbindungen nur von der eigenen Adresse; Fotos und Aufnahmen vom Gerät als `blob:`/`data:`. Damit laufen
  eingeschleuste Skripte, `onerror`-/`onclick`-Attribute und `javascript:`-Links nicht, und nichts kann Daten an fremde
  Adressen schicken. `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`.
  Folgen für den Code: **keine eingebetteten `<script>`-Blöcke, keine `on…`-Attribute, kein `eval`/`new Function`,
  keine fremden Adressen** (auch nicht in Testseiten – deren Vorbereitung steht in `tests/<name>.vorher.js`).
  Stil-Attribute sind erlaubt (`style-src-attr`), Stylesheets nur eigene.
- **Nicht einbettbar:** Läuft die App in einem fremden Rahmen (`window.top !== window.self`), zeigt sie nur einen
  Link „in einem eigenen Fenster öffnen“ und startet nicht (Schutz vor Klick-Fallen). GitHub Pages erlaubt keine
  eigenen HTTP-Header, darum per Skript.
- **Link-Schutz:** `<meta name="referrer" content="no-referrer">`; externe Links mit `rel="noopener"`.
- Test `sicherheit` versucht all das (Skript einschleusen, Attribut, `javascript:`, fremdes Skript, Bild und `fetch` an
  fremde Adresse, Einbetten) und prüft, dass eigene Fotos und Sicherungen weiter funktionieren.
- Grenze: Wer das GitHub-Konto übernimmt, kann auch diese Regeln ändern – darum Konto-Schutz (siehe [betrieb.md](betrieb.md)).

## Sicherheit beim Einspielen
Sicherungen (`format: 'buchstaben-sicherung'`, Version 1) und Stimm-Pakete (`format: 'buchstaben-stimmpaket'`) werden nie
roh übernommen:
- nur `data:`-URLs mit Bild (JPEG/PNG/WebP/GIF) oder Ton (`DATEN_URL`, `textZuBlob`) – keine fremden Adressen, kein SVG/HTML;
- nur bekannte Felder und Werte (`kindSauber`, `profilSauber`, `fundeSauber`), Namen gekürzt und als Text ausgegeben
  (`htmlText`), Steuerzeichen entfernt;
- nur bekannte Medien-Schlüssel (`MEDIEN_SCHLUESSEL`), Profil-IDs `p-…`, Kinder-IDs `k-…`;
- Größengrenzen (Medium 15 Mio. Zeichen, Sicherung 300 MB, Paket 20 MB); Kaputtes wird übersprungen und gezählt;
- erst prüfen, dann ersetzen. Ein Stimm-Paket legt immer einen neuen Menschen an (oder ersetzt nach Rückfrage
  dessen Aufnahmen), Kinder ändern sich nur nach Rückfrage.

## Lob und Stimmen
- Lob: `lobQuelle(b)` – eigene Lob-Aufnahmen des Profils, sonst Standard; nie zweimal derselbe Satz. Gäste
  (`k.lobGaeste`) loben fest beim Anfangsbuchstaben ihres Namens; ihr Foto zeigt `#sprecher`, sobald die Aufnahme
  startet. Name des Kindes nur ab und zu (`nameImLob`, nie nach einem Gast-Lob).
- `folgeAbspielen(folge, ersatzText)` spielt nacheinander; `eigeneDatei` ersetzt Standard-Dateien durch Studio-
  Aufnahmen (`{ standard: true }` umgeht das). Notfall-Sprachausgabe nur mit Stimmen, die auf dem Gerät laufen.

## Farben und Barrierefreiheit
Nachspuren: Blau (Startpunkt) + Orange (Pfeile), farbenblind-sicher, Unterschiede auch über Helligkeit:
Startpunkt/Strich 3,7 : 1 · Pfeile/Strich 3,3 : 1 · Zahl im Startpunkt 6,1 : 1 · Umriss/Tafel 2,1 : 1;
Kachel-Buchstaben auf Weiß ≥ 3,2 : 1 (`FARBE` in `app.js`). Hinweistext `--leise` 7,5 : 1, grüner Text `#2e7d32`
5,1 : 1. Gestaltungsrichtlinie der Nest-Familie: https://claude.ai/artifact/Gz3dEtZzQPZcjPagrsc398

## Tests
Ein Test je Funktion: `tests/<name>.js`. `werkzeuge/testseiten_erzeugen.sh` baut daraus mit der aktuellen
`index.html` die Seiten `tests/<name>.html` (nicht im Repo; `<base href="/">`, Begrüßung übersprungen außer bei
`willkommen`; optional ein Skript „vorher“, z. B. alter Datenstand). `werkzeuge/alle_tests.sh` öffnet jede Seite in
Firefox (headless, frisches Profil, Sprachausgabe aus), macht einen Screenshot und wertet die Leiste unten aus
(grün = OK). Einzeln: http://localhost:8765/tests/<name>.html

| Test | prüft |
|---|---|
| `spur` (Handy, Tablet) | Spur-Erkennung, geführtes Nachspuren (`#A`, `#a` wählt den Buchstaben) |
| `profile`, `kinder`, `sichern`, `woerter` | Profile, Kinder (`#wer`, `#kind`, `#eltern`), Sicherung inkl. manipulierter Dateien, persönliche Wörter |
| `startseite` (4 Größen) | Startseite nur Spiele, Weg ✏️ → Buchstaben → Nachspuren → zurück, Spielende |
| `zeigen`, `kiste`, `eigene-kisten`, `reime`, `silben`, `hoeren`, `legen`, `jagd`, `memory`, `name`, `album`, `farben`, `montessori`, `regal` | je ein Spiel bzw. eine Funktion |
| `menschen` | Menschen, Hauptstimme, Gast-Lob, Sicherung, Löschen |
| `mitmachen` | Einladungslink, Mitmach-Seite, Stimm-Paket, manipulierte Pakete |
| `studio` | Stimme einsprechen (künstlicher Ton statt Mikrofon) |
| `willkommen`, `info` | Begrüßung, Infoseite (Texte, erlaubte Links) |
| `pause` | gemeinsame Pause mit Zahlennest, Umzug der alten Einstellung |
| `datenvertrag` | Format, das Zahlennest liest |
| `offline` | Offline-Speicher installiert, Dateien und Schrift im Cache, fremde Caches bleiben |
| `sicherheit` | Sicherheitsregel, eingeschleuster Code läuft nicht, nichts geht nach außen, nicht einbettbar |

Stolperfallen: Firefox-Snap darf nur unter `~/snap/firefox/common/` schreiben; Firefox direkt starten
(`/snap/firefox/current/usr/lib/firefox/firefox`); Bildprüfung mit System-`python3`; asynchrone Tests binden
`/_warten?ms=…` als iframe ein und warten auf `startFertig`; Chrome zeichnet Linien der Länge 0 nicht (Punkte als
Kreise); Grid-Zeilen mit Seitenverhältnis-Kacheln rechnet Firefox falsch (feste Größen).

## Spiele im Detail
- **Startseite:** nur große Spiel-Kacheln ohne Scrollen; Regal je Kind (`spieleAus` speichert Ausgeblendetes, neue
  Spiele erscheinen von selbst; `START_REGAL` für neue Kinder). Jedes Spiel hat ein Ende (🏠 groß, 🔁 klein):
  Nachspuren nach 5 Buchstaben (`SPUR_ENDE_NACH`), Jagd nach 3 Funden.
- **Nachspuren:** Montessori-Gruppen (`MONTESSORI_GRUPPEN`, nächste ab `FREI_AB_STERNEN` = 2 je Buchstabe; sichtbar
  nur aktuelle Gruppe groß und gelernte klein) oder A–Z. Fingerfarben je Kind, Vibration abschaltbar.
- **Zeig mir:** Drei-Stufen-Lektion mit 3 Buchstaben (nie ähnlich: `AEHNLICHE_FORMEN`, `AEHNLICHE_LAUTE`), in Stufe 1
  einmal nachspuren; 6 Aufträge in Stufe 2; Unsicheres in Stufe 3 nochmal vorgestellt.
- **Wörterkiste:** 3 Wörter je Runde: „Das ist …“ → „Wo ist …?“ → „Was ist das? Sag es!“ → „Wo ist bei dir …?“
  bzw. „Wie macht …?“; Erzähl-Bild mit Fragen, 🏠/🔁 nach 15 s; Erzählung aufnehmen (15 s, Album 💬).
  Eigene Kisten „Meine Leute“/„Meine Kita“ (`EIGENE_KISTEN`) ab 3 Wörtern mit Foto und Aufnahme, ohne Stufe 4,
  „Wer ist das?“ bei Menschen.
- **Ich höre was:** 5 Runden; ähnliche Anlaute (f/v, k/c/q/x, e/ä, j/y) nie zusammen.
- **Reim-Paare:** einmal vorgemacht, 5 Runden (3 leichte, 2 mittlere); Ablenker nie mit gleichem betontem Vokal oder
  Anlaut; Stufe „nur hören“ je Kind.
- **Silben-Trommel:** 5 Runden (2, 1, 2, 3, 3 Silben), `SILBEN` in `letters.js`, Aufnahmen `audio/silbe-<wort>-<nr>.wav`;
  zu zweit mit zwei Trommeln.
- **Mein Name:** erster Buchstabe groß; Auswahl über Gesichter, wenn es weitere Namen gibt (Geschwister,
  freigegebene „Meine Leute“ aus einem Wort, 2–8 Zeichen, höchstens 6); bei fremden Namen erst der Name, dann das Lob.
- **Groß & klein:** 4 Paare; gleich aussehende (C/c, O/o …) und i+l nie zusammen.
- **Wörter legen:** nur lautgetreue Wörter (`lautgetreu`), auch persönliche; nach 2 Fehlversuchen Hinweis.
- **Sticker-Album:** nur Gesammeltes (Sticker, Funde, Erzählungen), kein Zähler.
- **Pause:** gemeinsam mit Zahlennest, siehe oben und `tests/pause.js`.

## Lokal starten
    .venv/bin/python werkzeuge/testserver.py 8765     # oder: python3 -m http.server 8765
Dann http://localhost:8765 öffnen. Am Handy im WLAN testen: `--lan` anhängen und die Adresse des Laptops öffnen
(Mikrofon und Offline-Speicher gehen dort nur über https bzw. localhost).
