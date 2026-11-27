#!/bin/sh
# Spiel-Logik ohne Android testen: sh tests/run.sh
set -e
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
javac -d "$OUT" app/src/main/java/dev/ghostnode/nexuspet/PetModel.java tests/PetModelTest.java
java -cp "$OUT" PetModelTest
