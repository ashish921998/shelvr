#!/bin/sh
set -eu

case "${1:-}" in
  Debug) name=EXPO_PUBLIC_REVENUECAT_TEST_KEY; prefix=test_ ;;
  Release) name=EXPO_PUBLIC_REVENUECAT_IOS_KEY; prefix=appl_ ;;
  *) echo 'Usage: prepare-billing.sh Debug|Release' >&2; exit 2 ;;
esac
dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
node --env-file-if-exists="$dir/../../native/.env.local" --input-type=module - "$dir" "$name" "$prefix" <<'JS'
import fs from "node:fs";
import path from "node:path";
const [directory, name, prefix] = process.argv.slice(2);
const value = process.env[name] ?? "";
if (!value.startsWith(prefix) || !/^[a-z]+_[A-Za-z0-9]+$/.test(value)) {
  throw new Error("Supply " + name + " for this build variant");
}
const file = path.join(directory, "Secrets.xcconfig");
const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const other = old.split("\n").filter(line => line && !line.trimStart().startsWith(name + " ="));
fs.writeFileSync(file, [...other, name + " = " + value, ""].join("\n"), {mode: 0o600});
JS
