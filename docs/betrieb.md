# Wortnest – Betrieb

Für den, der die App pflegt und veröffentlicht. Technischer Aufbau: [technik.md](technik.md).
Arbeitsregeln für Claude-Sitzungen: [`CLAUDE.md`](../CLAUDE.md).

## Die drei Grundregeln
1. **Die Adresse ändert sich nie.** `https://doganbedran.github.io/buchstaben/` – alle Kinder, Fotos, Aufnahmen und
   Sterne der Familien hängen im Browser an dieser Adresse. Kein Umbenennen des GitHub-Kontos oder des Repos, keine
   eigene Domain „davor“, kein Umzug zu einem anderen Anbieter. (Der App-Name darf sich ändern, die Adresse nicht.)
2. **Nichts Privates ins Repo.** Das Repo ist öffentlich: keine Namen, Fotos oder Aufnahmen der Familie, keine
   Sicherungsdateien, keine Screenshots mit echten Daten. Ausnahme: die Stimme des Sprechers (Liste in
   `audio/sprecher.json`). Nie Kinderstimmen.
3. **Nur veröffentlichen, wenn alle Tests grün sind.**

## Veröffentlichen (jede App-Änderung)
1. Testserver: `.venv/bin/python werkzeuge/testserver.py 8765 &`
2. `APP_VERSION` in `app.js` **und** `CACHE` in `sw.js` gemeinsam um 1 erhöhen (sonst sehen Geräte das Update nicht).
   Neue Dateien, die offline gebraucht werden, in `DATEIEN` in `sw.js`.
3. Tests und Push gekoppelt – Push nur bei Exit-Code 0 und ohne nicht freigegebene `.wav`:

       if ./werkzeuge/alle_tests.sh > /tmp/tests.txt 2>&1 && ! git status --short | grep -q "\.wav"; then
         git add -A && git commit -m "…" && git push
       else
         grep -v " OK$" /tmp/tests.txt
       fi

   Ein Lauf dauert etwa 14 Minuten. Während er läuft, **keine Dateien im Repo ändern** (der Commit nimmt den Stand
   am Ende, und geänderte Testskripte brechen den Lauf).
4. Live prüfen (GitHub Pages braucht 1–3 Minuten):
   `curl -s https://doganbedran.github.io/buchstaben/sw.js | grep "CACHE ="` → neue Nummer.
5. Am Handy: App schließen und neu öffnen; Version steht im Elternbereich unter „App“.

Reine Doku-Änderungen (`*.md`) brauchen keine neue Version und keinen Testlauf.

## Eine kaputte Version zurücknehmen
Nie `git push --force` und nie Geschichte umschreiben.
1. `git revert <commit>` (macht die Änderung rückgängig, als neuer Commit).
2. **Trotzdem Version und Cache um 1 erhöhen** – sonst behalten Geräte die kaputte Fassung im Offline-Speicher.
3. Tests, Push, Live-Prüfung wie oben.
Betrifft der Fehler gespeicherte Daten (z. B. eine falsche Umwandlung beim Start), zuerst nachstellen und einen Test
schreiben: Daten auf den Geräten lassen sich nicht zurückholen, nur weiter korrigieren.

## Aufnahmen (Sprecher-Stimme)
- **Studio am Laptop:** Testserver starten, http://localhost:8765/werkzeuge/aufnahme-studio.html öffnen. Bereiche
  Laute, Ansagen, Wörter, Lob, Kisten, Silben. Leertaste = Aufnahme, A = anhören, Enter = speichern. Das Studio
  schneidet Stille ab, gleicht die Lautstärke an und setzt „Laut … Laut … Wort“ selbst zusammen.
- Gespeichert wird nach `audio/`; jede Datei kommt in `audio/sprecher.json`.
- **Vor dem Push:** Aufnahmen anhören (Kinderstimmen oder Namen im Hintergrund?) und technisch prüfen (22050 Hz, mono,
  16 bit, keine Übersteuerung). Push von Aufnahmen nur mit ausdrücklicher Freigabe.
- **Neue Ansage:** Text in `ansagen.js` (`ANSAGEN`) eintragen; vorläufige Datei mit Piper in einen Zwischenordner
  erzeugen und **nur die neue Datei** nach `audio/` kopieren (Piper klingt bei jedem Lauf anders):

      .venv/bin/python werkzeuge/audio_erzeugen.py --stimme de_DE-thorsten-high --ziel /tmp/piper --teile ansagen
      cp /tmp/piper/ansage-<name>.wav audio/

  Danach im Studio mit der Sprecher-Stimme ersetzen. `audio_erzeugen.py` überschreibt Dateien aus `sprecher.json` nie.
- Piper-Stimme `de_DE-thorsten-high` liegt in `.stimmen/`, Piper im `.venv` – beides nicht im Repo.

## Zusammenspiel mit Zahlennest
Zahlennest (`doganbedran.github.io/zahlennest/`, Repo `doganbedran/zahlennest`, Ordner `../Zahlennest`) liegt unter
derselben Adresse im Browser. Darum:
- Wortnest schreibt nie `zn:`-Schlüssel und löscht nur eigene Offline-Speicher (`buchstaben-…`).
- Gemeinsam: nur die Pause (`nest:spielzeit`, `nest:pauseNach`, `nest:pauseAm`). Formatänderungen nur in beiden Apps.
- Zahlennest liest die Wortnest-Datenbank für „Aus Wortnest übernehmen“ – Format festgelegt im
  [Datenvertrag](datenvertrag.md), abgesichert durch den Test `datenvertrag`.
- „Website-Daten löschen“ im Browser trifft beide Apps.

## Konto und Zugänge sichern
Das GitHub-Konto `doganbedran` *ist* die Adresse der App. Geht es verloren, gibt es keine Updates mehr; wird es
umbenannt, verlieren alle Familien ihre Daten.
- Zwei-Faktor-Anmeldung einschalten und die **Wiederherstellungscodes** offline aufbewahren.
- Das Konto nicht umbenennen, das Repo nicht umbenennen oder privat stellen (Pages würde abgeschaltet).
- Repository-Einstellungen: Pages aus Branch `main`, Ordner `/`; die Datei `.nojekyll` muss bleiben.
- Eine Kopie des Repos liegt auf dem Laptop; zusätzlich ab und zu `git bundle create wortnest.bundle --all` an einem
  sicheren Ort ablegen.

## Laptop einrichten (falls neu)
- Ubuntu, `git`, `gh`, Firefox (Snap), System-`python3` mit PIL (für die Bildprüfung der Tests).
- `.venv` mit Piper: `python3 -m venv .venv`, pip per `get-pip.py` ins venv, dann `pip install piper-tts`;
  Stimme `de_DE-thorsten-high` nach `.stimmen/`.
- Tests schreiben Profile und Screenshots nach `~/snap/firefox/common/lernapp-test/` (Snap darf nicht nach /tmp).

## Rückmeldungen
Fragen, Ideen und Fehler kommen als Issue auf GitHub. Fehler zuerst nachstellen (Test schreiben, der rot wird), dann
beheben, dann veröffentlichen. Beobachtungen echter Kinder gehen vor Einschätzungen.

## Lizenzen und Recht
- Code und eigene Zeichnungen: AGPL-3.0 (`LICENSE`). Sprecher-Aufnahmen: CC BY-NC-ND 4.0 (`audio/LIZENZ.md`).
  Piper-Platzhalter: Datensatz CC0, Modell MIT. Schrift Andika: SIL OFL 1.1 (`fonts/OFL.txt`).
- Kontakt nur über GitHub. Kein Impressum, solange die App privat, kostenlos und werbefrei ist – vor breiter
  Bewerbung rechtlich beraten lassen.
- Absender „Lauschling“: im DPMA-Register und Play Store ohne Treffer geprüft (2026-10-11).
