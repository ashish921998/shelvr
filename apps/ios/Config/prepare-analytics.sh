#!/bin/sh
set -eu
dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
case "${1:-}" in
  Debug) envfile="$dir/../../native/.env.local" ;;
  Release) envfile=/dev/null ;;
  *) echo 'Usage: prepare-analytics.sh Debug|Release' >&2; exit 2 ;;
esac
node --env-file-if-exists="$envfile" --input-type=module - "$dir" "$1" <<'JS'
import fs from "node:fs";
import path from "node:path";
const token = process.env.POSTHOG_PROJECT_TOKEN;
const host = new URL(process.env.POSTHOG_HOST || "https://us.i.posthog.com");
if (!token || !/^[a-zA-Z0-9_]+$/.test(token) || host.protocol !== "https:" ||
    host.username || host.password || host.search || host.hash || host.pathname !== "/") {
  throw new Error("Supply POSTHOG_PROJECT_TOKEN and a valid POSTHOG_HOST for this build variant");
}
const file = path.join(process.argv[2], "Secrets.xcconfig");
const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const prefix = process.argv[3].toUpperCase() + "_POSTHOG_";
const other = old.split("\n").filter(line => line && !line.startsWith(prefix));
other.push(prefix + "TOKEN = " + token, prefix + "HOST = https:/$()/" + host.host, "");
fs.writeFileSync(file, other.join("\n"), {mode: 0o600});
JS
