#!/usr/bin/env bash
# Führt alle Testseiten in Firefox (headless) aus und meldet OK/FEHLER je Test.
# Erwartet den Testserver:  .venv/bin/python werkzeuge/testserver.py 8765
# Ergebnis = Farbe der Leiste unten (grün = OK); Screenshots in ~/snap/firefox/common/lernapp-test/.
set -uo pipefail
cd "$(dirname "$0")/.."
./werkzeuge/testseiten_erzeugen.sh >/dev/null
D=~/snap/firefox/common/lernapp-test   # Snap-Firefox darf nur in ~/snap schreiben
mkdir -p "$D"
URL=http://localhost:8765
LAEUFE=(
  "spur-handy|tests/spur.html|412,860|300"
  "spur-tablet|tests/spur.html|1280,800|300"
  "profile|tests/profile.html|412,300|90"
  "kinder|tests/kinder.html#wer|412,300|120"
  "sichern|tests/sichern.html|412,300|90"
  "hoeren|tests/hoeren.html|412,300|90"
  "woerter|tests/woerter.html|412,860|120"
  "name|tests/name.html|412,860|90"
  "album|tests/album.html|412,860|90"
  "memory|tests/memory.html|412,860|90"
  "montessori|tests/montessori.html|412,860|90"
  "farben|tests/farben.html|412,860|90"
  "jagd|tests/jagd.html|412,860|90"
  "legen|tests/legen.html|412,860|90"
  "silben|tests/silben.html|412,860|90"
  "silben-tab|tests/silben.html|1280,800|90"
  "silben-klein|tests/silben.html|360,640|90"
  "startseite|tests/startseite.html|412,860|60"
  "start-klein|tests/startseite.html|360,640|60"
  "start-tab|tests/startseite.html|1280,800|60"
)
fehler=0
for lauf in "${LAEUFE[@]}"; do
  IFS='|' read -r name seite groesse zeit <<< "$lauf"
  rm -rf "$D/p-$name" "$D/t-$name.png"; mkdir -p "$D/p-$name"
  timeout "$zeit" firefox --headless --profile "$D/p-$name" --window-size="$groesse" --screenshot "$D/t-$name.png" "$URL/$seite" >/dev/null 2>&1
  # System-Python (hat PIL), auch wenn .venv aktiv ist
  ergebnis=$(/usr/bin/python3 -c "
from PIL import Image
import os, sys
p = '$D/t-$name.png'
if not os.path.exists(p): print('KEIN BILD'); sys.exit()
im = Image.open(p).convert('RGB'); r, g, b = im.getpixel((3, im.height - 3))
print('OK' if g > 100 and r < 60 else 'FEHLER')")
  printf '%-12s %s\n' "$name" "$ergebnis"
  [ "$ergebnis" = OK ] || fehler=1
done
exit $fehler
