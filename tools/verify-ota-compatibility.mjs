#!/usr/bin/env node
// Usage: node tools/verify-ota-compatibility.mjs --profile <profile> --platform <all|ios|android>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isMainModule } from "./main-module.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NATIVE_DIR = join(REPO_ROOT, "apps/native");
const BASELINE_FILE = join(NATIVE_DIR, "released-builds.json");
const BASELINE_PATH = "apps/native/released-builds.json";
const PLATFORMS = ["ios", "android"];

export function resolvePlatforms(platform) {
  if (platform === "all") return [...PLATFORMS];
  return PLATFORMS.includes(platform) ? [platform] : null;
}

export function baselineFor(baselines, profile, platform) {
  return baselines?.[profile]?.[platform] ?? null;
}

function hashFailure(hash) {
  if (hash === "") return "fingerprint:generate produced an empty hash";
  const kind =
    hash === undefined
      ? "nothing"
      : hash === null
        ? "null"
        : `a ${typeof hash}`;
  return `fingerprint:generate produced ${kind}, not a hash string`;
}

function statusFor({ reason, baseline, localFingerprint }) {
  if (reason !== null) return "fingerprint-failed";
  if (baseline === null) return "missing-baseline";
  if (baseline.fingerprint !== localFingerprint) return "mismatch";
  return "match";
}

export async function checkCompatibility({
  profile,
  platforms,
  baselines,
  fingerprint,
}) {
  return Promise.all(
    platforms.map(async (platform) => {
      const recorded = baselineFor(baselines, profile, platform);
      const baseline =
        typeof recorded?.fingerprint === "string" && recorded.fingerprint !== ""
          ? recorded
          : null;

      let localFingerprint = null;
      let reason = null;
      try {
        const hash = await fingerprint(platform);
        if (typeof hash === "string" && hash !== "") localFingerprint = hash;
        else reason = hashFailure(hash);
      } catch (error) {
        reason = error?.message ?? String(error);
      }

      const status = statusFor({ reason, baseline, localFingerprint });
      return { platform, profile, status, baseline, localFingerprint, reason };
    }),
  );
}

export function isBlocked(results) {
  return results.length === 0 || results.some((r) => r.status !== "match");
}

const STATUS_LABEL = {
  match: "match",
  mismatch: "MISMATCH",
  "missing-baseline": "NO BASELINE RECORDED",
  "fingerprint-failed": "FINGERPRINT FAILED",
};

const LABEL_WIDTH = 16;

function field(label, ...lines) {
  return lines.map(
    (line, index) =>
      `    ${(index === 0 ? label : "").padEnd(LABEL_WIDTH)}${line}`,
  );
}

const STATUS_DETAIL = {
  match: (result) => [
    ...field("released build", result.baseline.buildId),
    ...field("released as", result.baseline.release),
    ...field("shared runtime", result.localFingerprint),
  ],
  mismatch: (result) => [
    ...field("released build", result.baseline.buildId),
    ...field("released as", result.baseline.release),
    ...field("it runs", result.baseline.fingerprint),
    ...field("this tree is", result.localFingerprint),
    ...field(
      "next step",
      `Ship a new store build for ${result.platform}. Nothing published from`,
      "this tree reaches the recorded binary, so people on it stay",
      "where they are until they take a store build. If a newer one",
      `is already out, record it in ${BASELINE_PATH} instead.`,
    ),
  ],
  "missing-baseline": (result) => [
    ...field("released build", "none recorded"),
    ...field("this tree is", result.localFingerprint ?? "unknown"),
    ...field(
      "next step",
      `Record the released ${result.platform} build under`,
      `"${result.profile}" in ${BASELINE_PATH},`,
      "with the fingerprint it runs:",
      "  eas fingerprint:compare --build-id <id> \\",
      "    --environment <env> --json",
      "(<env> is the profile's environment in apps/native/eas.json)",
    ),
  ],
  "fingerprint-failed": (result) => [
    ...field("reason", result.reason),
    ...field(
      "next step",
      "Fix the fingerprint toolchain. Until it runs, nothing here can",
      "tell whether this update reaches the released build, so the",
      "publish is blocked.",
    ),
  ],
};

export function formatReport(results) {
  if (results.length === 0) return "ota compatibility  no platform was checked";
  const lines = [`ota compatibility  profile=${results[0].profile}`];
  for (const result of results) {
    lines.push(
      "",
      `  ${result.platform.padEnd(8)}  ${STATUS_LABEL[result.status]}`,
      ...STATUS_DETAIL[result.status](result),
    );
  }
  return lines.join("\n");
}

function firstLine(text) {
  return String(text).split("\n")[0].trim();
}

function tail(text, lines = 3) {
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(-lines)
    .join(" | ");
}

export function readFingerprintHash(stdout, platform) {
  try {
    return JSON.parse(stdout).hash;
  } catch {
    throw new Error(
      `expo-updates fingerprint:generate --platform ${platform} printed ` +
        `output that is not JSON: ${firstLine(stdout).slice(0, 120)}`,
    );
  }
}

async function generateFingerprint(platform) {
  let cli;
  try {
    const require = createRequire(`${NATIVE_DIR}/`);
    cli = join(
      dirname(require.resolve("expo-updates/package.json")),
      "bin/cli.js",
    );
  } catch (error) {
    throw new Error(
      `cannot resolve the expo-updates CLI from apps/native: ${firstLine(error.message)}`,
    );
  }

  let stdout;
  try {
    stdout = execFileSync(
      process.execPath,
      [cli, "fingerprint:generate", "--platform", platform],
      {
        cwd: NATIVE_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch (error) {
    const stderr = tail(error.stderr ?? "");
    throw new Error(
      `expo-updates fingerprint:generate --platform ${platform} failed: ` +
        `${firstLine(error.message)}${stderr === "" ? "" : ` (${stderr})`}`,
    );
  }

  return readFingerprintHash(stdout, platform);
}

const USAGE =
  "usage: verify-ota-compatibility.mjs --profile <profile> --platform <all|ios|android>\n";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== "--profile" && flag !== "--platform") return null;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) return null;
    args[flag.slice(2)] = value;
    index += 1;
  }
  return args.profile && args.platform ? args : null;
}

async function main(argv) {
  const args = parseArgs(argv);
  const platforms = args && resolvePlatforms(args.platform);
  if (!platforms) {
    process.stderr.write(USAGE);
    return 2;
  }

  let baselines;
  try {
    baselines = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  } catch (error) {
    process.stderr.write(
      `Cannot read ${BASELINE_PATH}: ${firstLine(error.message)}\n` +
        "Without it there is no released build to compare against, so the " +
        "publish is blocked.\n",
    );
    return 1;
  }

  const results = await checkCompatibility({
    profile: args.profile,
    platforms,
    baselines,
    fingerprint: generateFingerprint,
  });
  process.stdout.write(
    `${formatReport(results)}\n\n` +
      `  fingerprinted with APP_VARIANT=${process.env.APP_VARIANT ?? "(unset, so app.config.js uses development)"}\n`,
  );
  return isBlocked(results) ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}

export { BASELINE_FILE, BASELINE_PATH };
