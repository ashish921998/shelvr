#!/usr/bin/env bash
# Model-check one TLA+ spec with a pinned TLC. Needs Java 11+.
# Usage: tools/formal/run-tlc.sh tools/formal/image-import/ImageImport.tla [extra TLC args]
set -euo pipefail

VERSION=1.7.4
SHA256=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
JAR="${TLA_CACHE:-$HOME/.cache/tla}/tla2tools-$VERSION.jar"

if [[ ! -f "$JAR" ]] || ! echo "$SHA256  $JAR" | shasum -a 256 -c --status; then
  mkdir -p "$(dirname "$JAR")"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v$VERSION/tla2tools.jar"
  echo "$SHA256  $JAR" | shasum -a 256 -c --status
fi

spec="$1"
shift
states="$(mktemp -d "${TMPDIR:-/tmp}/tlc-states.XXXXXX")"
trap 'rm -rf "$states"' EXIT
cd "$(dirname "$spec")"
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto -deadlock \
  -metadir "$states" "$(basename "$spec")" "$@"
