#!/usr/bin/env bash
# Erzeugt _test.html und _test_profile.html aus der aktuellen index.html (nach Änderungen an index.html ausführen).
set -euo pipefail
cd "$(dirname "$0")/.."
sed 's#<script src="app.js"></script>#<script src="app.js"></script><script src="_test.js"></script>#' index.html > _test.html
sed 's#<script src="letters.js"></script>#<script>\n  // Alte Datenbank (Version 1) mit einer Aufnahme für "m" anlegen, wie vor dem Profil-Update\n  const v1 = indexedDB.open("lernapp", 1);\n  v1.onupgradeneeded = () => v1.result.createObjectStore("aufnahmen").put(new Blob(["x"], { type: "audio/webm" }), "m");\n  v1.onsuccess = () => v1.result.close();\n</script>\n  <script src="letters.js"></script>#; s#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_profile.js"></script>\n  <iframe src="/_warten?ms=6000" hidden></iframe>#' index.html > _test_profile.html
echo "Testseiten erzeugt"
