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
  "spur-handy|_test.html|412,860|300"
  "spur-tablet|_test.html|1280,800|300"
  "profile|_test_profile.html|412,300|90"
  "kinder|_test_kinder.html#wer|412,300|120"
  "sichern|_test_sichern.html|412,300|90"
  "hoeren|_test_hoeren.html|412,300|90"
  "woerter|_test_woerter.html|412,860|120"
  "name|_test_name.html|412,860|90"
  "album|_test_album.html|412,860|90"
  "memory|_test_memory.html|412,860|90"
  "montessori|_test_montessori.html|412,860|90"
  "farben|_test_farben.html|412,860|90"
  "jagd|_test_jagd.html|412,860|90"
  "legen|_test_legen.html|412,860|90"
)
fehler=0
for lauf in "${LAEUFE[@]}"; do
  IFS='|' read -r name seite groesse zeit <<< "$lauf"
  rm -rf "$D/p-$name" "$D/t-$name.png"; mkdir -p "$D/p-$name"
  timeout "$zeit" firefox --headless --profile "$D/p-$name" --window-size="$groesse" --screenshot "$D/t-$name.png" "$URL/$seite" >/dev/null 2>&1
  ergebnis=$(python3 -c "
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
