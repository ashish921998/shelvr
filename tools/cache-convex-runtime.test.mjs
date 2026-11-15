import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const VERSION = "precompiled-2026-10-22-1447815";
const SCRIPT = resolve("tools/cache-convex-runtime.sh");

function fixture(t, { missingDashboard = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "shelvr-convex-runtime-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin");
  const cache = join(dir, "cache");
  const archives = join(dir, "archives");
  const state = join(dir, "state");
  for (const path of [bin, archives, state]) mkdirSync(path);
  for (const [archive, name] of [
    ["backend.zip", "convex-local-backend"],
    ["dashboard.zip", missingDashboard ? "other.html" : "index.html"],
  ]) {
    writeFileSync(join(dir, name), "fixture");
    execFileSync("zip", ["-q", join(archives, archive), name], { cwd: dir });
  }
  const stub = (name, source) => {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/bash\n${source}\n`);
    chmodSync(path, 0o755);
  };
  stub("sleep", "exit 0");
  stub("uname", 'if [ "$1" = "-s" ]; then echo Darwin; else echo arm64; fi');
  stub(
    "gh",
    `while [ "$#" -gt 0 ]; do
  case "$1" in
    --pattern) name=$2; shift ;;
    --output) output=$2; shift ;;
  esac
  shift
done
count_file="$DOWNLOAD_STATE/$name"
count=0
if [ -f "$count_file" ]; then count=$(cat "$count_file"); fi
count=$((count + 1))
echo "$count" > "$count_file"
if [ "$count" -le "$FAIL_DOWNLOADS" ]; then exit 1; fi
if [ "$count" -le "$CORRUPT_DOWNLOADS" ]; then echo broken > "$output"; exit 0; fi
archive=backend.zip
if [ "$name" = dashboard.zip ]; then archive=dashboard.zip; fi
cp "$DOWNLOAD_FIXTURES/$archive" "$output"`,
  );
  const run = (env = {}, version = VERSION) =>
    spawnSync("bash", [SCRIPT, version, cache], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        DOWNLOAD_FIXTURES: archives,
        DOWNLOAD_STATE: state,
        FAIL_DOWNLOADS: "0",
        CORRUPT_DOWNLOADS: "0",
        ...env,
      },
    });
  const attempts = (name) =>
    Number(readFileSync(join(state, name), "utf8").trim());
  return { run, cache, state, attempts };
}

test("installs both validated archives in the pinned Convex cache layout", (t) => {
  const { run, cache } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(
      join(cache, "binaries", VERSION, "convex-local-backend"),
      "utf8",
    ),
    "fixture",
  );
  assert.equal(
    readFileSync(join(cache, "dashboard", "out", "index.html"), "utf8"),
    "fixture",
  );
  assert.deepEqual(
    JSON.parse(readFileSync(join(cache, "dashboard", "config.json"), "utf8")),
    { version: VERSION },
  );
});

test("recovers from failed downloads for each asset", (t) => {
  const { run, attempts } = fixture(t);
  const result = run({ FAIL_DOWNLOADS: "2" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(attempts("convex-local-backend-aarch64-apple-darwin.zip"), 3);
  assert.equal(attempts("dashboard.zip"), 3);
});

test("retries corrupt archives even when the download command succeeds", (t) => {
  const { run, attempts } = fixture(t);
  const result = run({ CORRUPT_DOWNLOADS: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(attempts("dashboard.zip"), 2);
});

test("failed downloads stop after three attempts and preserve an existing cache", (t) => {
  const { run, cache, attempts } = fixture(t);
  mkdirSync(cache);
  writeFileSync(join(cache, "existing"), "keep");
  const result = run({ FAIL_DOWNLOADS: "3" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /after 3 attempts/);
  assert.equal(attempts("convex-local-backend-aarch64-apple-darwin.zip"), 3);
  assert.equal(readFileSync(join(cache, "existing"), "utf8"), "keep");
  assert.equal(existsSync(join(cache, "dashboard")), false);
});

test("a persistently corrupt archive fails without marking the cache ready", (t) => {
  const { run, cache } = fixture(t);
  assert.equal(run({ CORRUPT_DOWNLOADS: "3" }).status, 1);
  assert.equal(existsSync(cache), false);
});

test("a dashboard archive missing its entry point is rejected", (t) => {
  const { run, cache } = fixture(t, { missingDashboard: true });
  assert.equal(run().status, 1);
  assert.equal(existsSync(cache), false);
});

test("invalid versions fail before any download or cache write", (t) => {
  const { run, cache, state } = fixture(t);
  const result = run({}, "../../elsewhere");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid Convex backend version/);
  assert.equal(existsSync(cache), false);
  assert.equal(existsSync(join(state, "dashboard.zip")), false);
});
