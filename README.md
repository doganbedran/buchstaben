# Wortnest (früher „Buchstaben-Spuren“)

Montessori-inspirierte Lern-App für Kinder ab 3: Buchstaben in Schreibrichtung nachspuren, Laute hören („mmm … wie
Maus“), Wörter lernen, reimen, Silben trommeln und erzählen – mit den Stimmen und Fotos der eigenen Familie.
Läuft im Browser als installierbare App (PWA), offline, kostenlos, ohne Werbung, ohne Konto und ohne Tracking;
alle Daten bleiben auf dem Gerät. Wortnest · eine App vom Lauschling – Schwester-App:
[Zahlennest](https://doganbedran.github.io/zahlennest/).

**Ausprobieren:** https://doganbedran.github.io/buchstaben/ – im Browser öffnen, auf dem Handy „Zum Startbildschirm
hinzufügen“. Elternbereich: ⚙️ oben rechts 2 Sekunden halten.

**Dokumentation:** [docs/](docs/README.md) – [Hilfe für Eltern](docs/eltern-hilfe.md) ·
[Häufige Fragen](docs/fragen.md) · [Was ist neu?](docs/aenderungen.md) · [Für Kitas](docs/kita.md) ·
[Betrieb](docs/betrieb.md) · [Technik](docs/technik.md)

Fragen, Ideen und Fehler gern als [Issue](https://github.com/doganbedran/buchstaben/issues).

## Lizenz
- Programmcode und eigene Zeichnungen (`bilder/`, Symbol): [GNU AGPL 3.0](LICENSE)
- Aufnahmen des Sprechers (`audio/`, Liste in `audio/sprecher.json`): CC BY-NC-ND 4.0 – siehe [audio/LIZENZ.md](audio/LIZENZ.md)
- Vorläufige Aufnahmen: Piper „Thorsten“ (Datensatz CC0, Modell MIT)
- Schrift: Andika von SIL International, mitgeliefert in `fonts/` (SIL Open Font License 1.1, `fonts/OFL.txt`)

## Name und Adresse
Seit Version 68 heißt die App **Wortnest** (Symbol: das „a“ sitzt im Nest). Adresse und Repo bleiben `buchstaben` –
daran hängen alle Fotos, Aufnahmen und Sterne auf den Geräten.

## Lokal starten
    .venv/bin/python werkzeuge/testserver.py 8765     # oder: python3 -m http.server 8765
Dann http://localhost:8765 öffnen. Alle Tests: `./werkzeuge/alle_tests.sh` (Details in [docs/technik.md](docs/technik.md)).
