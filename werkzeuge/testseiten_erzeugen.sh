#!/usr/bin/env bash
# Erzeugt _test.html und _test_profile.html aus der aktuellen index.html (nach Änderungen an index.html ausführen).
set -euo pipefail
cd "$(dirname "$0")/.."
sed 's#<script src="app.js"></script>#<script src="app.js"></script><script src="_test.js"></script>#' index.html > _test.html
sed 's#<script src="letters.js"></script>#<script>\n  // Alte Datenbank (Version 1) mit einer Aufnahme für "m" anlegen, wie vor dem Profil-Update\n  const v1 = indexedDB.open("lernapp", 1);\n  v1.onupgradeneeded = () => v1.result.createObjectStore("aufnahmen").put(new Blob(["x"], { type: "audio/webm" }), "m");\n  v1.onsuccess = () => v1.result.close();\n</script>\n  <script src="letters.js"></script>#; s#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_profile.js"></script>\n  <iframe src="/_warten?ms=6000" hidden></iframe>#' index.html > _test_profile.html
sed 's#<script src="letters.js"></script>#<script>\n  // Stand vor den Kinder-Profilen: Sterne und Schrift app-weit\n  localStorage.setItem("sterne", JSON.stringify({ a: 2 }));\n  localStorage.setItem("schreibweise", JSON.stringify("gross"));\n</script>\n  <script src="letters.js"></script>#; s#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_kinder.js"></script>\n  <iframe src="/_warten?ms=35000" hidden></iframe>#' index.html > _test_kinder.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_sichern.js"></script>\n  <iframe src="/_warten?ms=12000" hidden></iframe>#' index.html > _test_sichern.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_hoeren.js"></script>\n  <iframe src="/_warten?ms=6000" hidden></iframe>#' index.html > _test_hoeren.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_woerter.js"></script>\n  <iframe src="/_warten?ms=15000" hidden></iframe>#' index.html > _test_woerter.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_name.js"></script>\n  <iframe src="/_warten?ms=8000" hidden></iframe>#' index.html > _test_name.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_album.js"></script>\n  <iframe src="/_warten?ms=9000" hidden></iframe>#' index.html > _test_album.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_memory.js"></script>\n  <iframe src="/_warten?ms=4000" hidden></iframe>#' index.html > _test_memory.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_montessori.js"></script>\n  <iframe src="/_warten?ms=10000" hidden></iframe>#' index.html > _test_montessori.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_farben.js"></script>\n  <iframe src="/_warten?ms=10000" hidden></iframe>#' index.html > _test_farben.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_jagd.js"></script>\n  <iframe src="/_warten?ms=12000" hidden></iframe>#' index.html > _test_jagd.html
sed 's#<script src="app.js"></script>#<script src="app.js"></script>\n  <script src="_test_legen.js"></script>\n  <iframe src="/_warten?ms=4000" hidden></iframe>#' index.html > _test_legen.html
echo "Testseiten erzeugt"
