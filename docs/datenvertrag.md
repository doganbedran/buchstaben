# Datenvertrag: was Zahlennest aus Wortnest lesen darf

Wortnest (`doganbedran.github.io/buchstaben/`) und Zahlennest (`doganbedran.github.io/zahlennest/`) liegen unter
derselben Adresse im Browser und könnten sich gegenseitig die Daten verändern. Darum gilt:

- **Zahlennest öffnet Wortnests Datenbank nur lesend**, für „Aus Wortnest übernehmen“, und kopiert in die eigene
  Datenbank `zahlennest`. Es öffnet `lernapp` **ohne Versionsnummer** (`indexedDB.open('lernapp')`), damit nie ein
  Upgrade ausgelöst wird, und bricht ab, wenn die Datenbank nicht existiert (`onupgradeneeded` = gibt es nicht →
  Transaktion abbrechen, nichts anlegen).
- **Wortnest hält dieses Format stabil.** Der Test `tests/datenvertrag.js` schlägt an, wenn sich etwas ändert.
  Änderungen nur mit Absprache, dann hier die Version erhöhen und Zahlennest anpassen.
- Gemeinsam beschrieben werden nur die Pausen-Schlüssel `nest:spielzeit`, `nest:pauseNach`, `nest:pauseAm`
  (Format im Abschnitt „Pause“ in `app.js` beider Apps). Sonst schreibt keine App in den Bereich der anderen
  (Wortnest: Schlüssel ohne Präfix und Datenbank `lernapp`; Zahlennest: `zn:` und `zahlennest`).

## Vertrag Version 1

IndexedDB `lernapp`, Version 3, Speicher:

| Speicher | Schlüssel | Inhalt |
|---|---|---|
| `kinder` | `id` (`k-…`) | `{ id, name (≤ 20), tier (Emoji), foto: Blob \| null, nameStimme: Blob \| null, profil ('standard' oder 'p-…'), lobGaeste?: ['p-…'], erstellt }` – weitere Felder (Sterne, Album, Funde …) sind Wortnest-intern und werden nicht übernommen |
| `profile` | `id` (`p-…`) | `{ id, name (≤ 30), erstellt, woerter?: [{ id, b, wort }], kistenWoerter?: [{ id, kiste: 'leute'\|'kita', wort, name?: true }] }` – ein Profil = ein „Mensch“ |
| `medien` | Text `<profil>\|<platz>\|<art>` | Wert ist der Blob selbst. `art` = `bild` oder `stimme`. `platz` = `ich` (Foto der Person), `lob-1` … `lob-5`, `w-<id>` (persönliches Wort / Kisten-Wort), ein Buchstabe, `datei:<name>.wav` (Studio) |

Für „Aus Wortnest übernehmen“ sinnvoll: Kinder (Name, Tier/Foto, Namensaufnahme), Menschen (Name, Foto `ich`,
Lob `lob-n`), „Meine Leute“ (`kistenWoerter` mit `kiste: 'leute'` und `w-<id>`-Medien), die Zuordnung Hauptstimme
(`profil`) und Gäste (`lobGaeste`). Alles andere ist buchstabenspezifisch.
Auch beim Übernehmen gelten die Regeln fürs Einspielen: nur bekannte Felder, Namen als Text, nur Bild-/Ton-Blobs.
