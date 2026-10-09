#!/usr/bin/env bash
# Erzeugt die Testseiten tests/<name>.html aus der aktuellen index.html (läuft automatisch in alle_tests.sh).
# Jede Seite = App + tests/<name>.js; <base href="/"> lässt die App ihre Dateien (app.js, audio/ …) vom Hauptordner laden.
# Die erzeugten .html-Dateien stehen in .gitignore.
set -euo pipefail
cd "$(dirname "$0")/.."

# seite <name> <Wartezeit ms oder 0> [Skript, das vor letters.js läuft (alter Datenstand)]
seite() {
  local name=$1 warten=$2 vorher=${3:-}
  local nachher="  <script src=\"tests/$name.js\"></script>"
  [ "$warten" != 0 ] && nachher+=$'\n'"  <iframe src=\"/_warten?ms=$warten\" hidden></iframe>"
  VORHER="$vorher" NACHHER="$nachher" /usr/bin/python3 - "$name" <<'PY'
import os, sys
s = open('index.html', encoding='utf-8').read()
s = s.replace('<head>', '<head>\n  <base href="/">', 1)
if os.environ['VORHER']:
    s = s.replace('  <script src="letters.js"></script>', f"  <script>\n{os.environ['VORHER']}\n  </script>\n  <script src=\"letters.js\"></script>", 1)
s = s.replace('  <script src="app.js"></script>', '  <script src="app.js"></script>\n' + os.environ['NACHHER'], 1)
open(f'tests/{sys.argv[1]}.html', 'w', encoding='utf-8').write(s)
PY
}

seite spur 0
seite profile 6000 '  // Alte Datenbank (Version 1) mit einer Aufnahme für "m" anlegen, wie vor dem Profil-Update
  const v1 = indexedDB.open("lernapp", 1);
  v1.onupgradeneeded = () => v1.result.createObjectStore("aufnahmen").put(new Blob(["x"], { type: "audio/webm" }), "m");
  v1.onsuccess = () => v1.result.close();'
seite kinder 35000 '  // Stand vor den Kinder-Profilen: Sterne und Schrift app-weit
  localStorage.setItem("sterne", JSON.stringify({ a: 2 }));
  localStorage.setItem("schreibweise", JSON.stringify("gross"));'
seite sichern 12000
seite hoeren 6000
seite woerter 15000
seite name 8000
seite album 9000
seite memory 4000
seite montessori 10000
seite farben 10000
seite jagd 12000
seite legen 4000
seite silben 15000
seite startseite 3000
seite regal 12000
echo "Testseiten erzeugt"
