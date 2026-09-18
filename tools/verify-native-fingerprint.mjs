#!/usr/bin/env node
// Fails when the native fingerprint differs between two git refs.
//
// app.json pins the runtime version to the fingerprint policy, so an OTA
// update only reaches installs whose store build shares its fingerprint. A
// dependency or config change that moves the fingerprint strands every OTA
// published from main until a new store build ships, and nothing in the
// diff says so. This guard exports both refs to a temp dir, installs each
// from its own lockfile, computes the fingerprint per platform in one
// environment, and lists every source that differs.
//
// An intended move is acknowledged with a commit trailer in base..head:
//
//   Native-Fingerprint: changed
//
// Usage: node tools/verify-native-fingerprint.mjs <base-ref> [head-ref]

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NATIVE_DIR = "apps/native";
const PLATFORMS = ["ios", "android"];
const ACKNOWLEDGEMENT = "Native-Fingerprint: changed";

export function sourceKey(source) {
  return source.filePath ?? source.id;
}

export function diffSources(base, head) {
  const before = new Map(base.map((source) => [sourceKey(source), source]));
  const after = new Map(head.map((source) => [sourceKey(source), source]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, source] of after) {
    const prior = before.get(key);
    if (!prior) added.push({ key, reasons: source.reasons });
    else if (prior.hash !== source.hash)
      changed.push({ key, reasons: source.reasons });
  }
  for (const [key, source] of before) {
    if (!after.has(key)) removed.push({ key, reasons: source.reasons });
  }
  return { added, removed, changed };
}

export function isAcknowledged(log) {
  return /^Native-Fingerprint:\s*changed\s*$/m.test(log);
}

function git(args, options = {}) {
  return execFileSync("git", ["-C", REPO_ROOT, ...args], {
    encoding: "utf8",
    ...options,
  }).trim();
}

function resolveCommit(ref) {
  return git(["rev-parse", "--verify", `${ref}^{commit}`]);
}

function timed(label, run) {
  const started = Date.now();
  const result = run();
  process.stderr.write(
    `${label} ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
  );
  return result;
}

function exportTree(sha, dir) {
  mkdirSync(dir, { recursive: true });
  const archive = `${dir}.tar`;
  git(["archive", "--format=tar", "-o", archive, sha]);
  execFileSync("tar", ["-xf", archive, "-C", dir]);
  rmSync(archive);
  return dir;
}

function installDependencies(dir) {
  execFileSync("pnpm", ["install", "--frozen-lockfile"], {
    cwd: dir,
    env: { ...process.env, CI: "true", HUSKY: "0" },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function fingerprint(dir, platform, variant) {
  const nativeDir = join(dir, NATIVE_DIR);
  const require = createRequire(`${nativeDir}/`);
  const cli = join(
    dirname(require.resolve("expo-updates/package.json")),
    "bin/cli.js",
  );
  const stdout = execFileSync(
    process.execPath,
    [cli, "fingerprint:generate", "--platform", platform, "--debug"],
    {
      cwd: nativeDir,
      env: { ...process.env, CI: "true", APP_VARIANT: variant },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout);
}

function short(sha) {
  return sha.slice(0, 7);
}

function formatReport({
  baseRef,
  base,
  headRef,
  head,
  variant,
  results,
  acknowledged,
}) {
  const lines = [
    `native fingerprint  base=${baseRef} (${short(base)})  head=${headRef} (${short(head)})  APP_VARIANT=${variant}`,
  ];
  for (const { platform, baseHash, headHash, diff } of results) {
    const state = baseHash === headHash ? "unchanged" : "CHANGED";
    lines.push(
      `  ${platform.padEnd(8)} ${short(baseHash)} -> ${short(headHash)}  ${state}`,
    );
    for (const kind of ["changed", "added", "removed"]) {
      for (const { key, reasons } of diff[kind]) {
        lines.push(`    ${kind.padEnd(8)} ${key}  (${reasons.join(", ")})`);
      }
    }
  }
  const drifted = results.some((r) => r.baseHash !== r.headHash);
  if (drifted && acknowledged) {
    lines.push(`  acknowledged by a "${ACKNOWLEDGEMENT}" commit trailer`);
  }
  if (drifted && !acknowledged) {
    lines.push(
      "",
      "This range moves the native fingerprint, so an OTA published after it",
      "merges reaches no existing install until a new store build ships.",
      "If that is intended, add this trailer to a commit in the range:",
      "",
      `  ${ACKNOWLEDGEMENT}`,
    );
  }
  return lines.join("\n");
}

function main(argv) {
  const [baseRef, headRef = "HEAD"] = argv;
  if (!baseRef) {
    process.stderr.write(
      "usage: verify-native-fingerprint.mjs <base-ref> [head-ref]\n",
    );
    return 2;
  }
  const variant = process.env.APP_VARIANT ?? "production";
  const base = resolveCommit(baseRef);
  const head = resolveCommit(headRef);
  const work = mkdtempSync(join(tmpdir(), "native-fingerprint-"));
  try {
    const trees = {};
    for (const [name, sha] of [
      ["base", base],
      ["head", head],
    ]) {
      trees[name] = timed(`export ${name}`, () =>
        exportTree(sha, join(work, name)),
      );
      timed(`install ${name}`, () => installDependencies(trees[name]));
    }
    const results = PLATFORMS.map((platform) => {
      const before = timed(`fingerprint base ${platform}`, () =>
        fingerprint(trees.base, platform, variant),
      );
      const after = timed(`fingerprint head ${platform}`, () =>
        fingerprint(trees.head, platform, variant),
      );
      return {
        platform,
        baseHash: before.hash,
        headHash: after.hash,
        diff: diffSources(before.sources, after.sources),
      };
    });
    const acknowledged = isAcknowledged(
      git(["log", "--format=%B", `${base}..${head}`]),
    );
    const report = formatReport({
      baseRef,
      base,
      headRef,
      head,
      variant,
      results,
      acknowledged,
    });
    process.stdout.write(`${report}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `\`\`\`\n${report}\n\`\`\`\n`,
      );
    }
    const drifted = results.some((r) => r.baseHash !== r.headHash);
    return drifted && !acknowledged ? 1 : 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main(process.argv.slice(2)));
}
