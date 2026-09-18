#!/usr/bin/env node
/**
 * Block an OTA publish whose update could not reach the released build.
 *
 * `app.json` pins `runtimeVersion` to the `fingerprint` policy, and a binary
 * only accepts updates whose runtime version equals its own. So a native change
 * never makes `eas update` fail. It makes the publish land on a runtime version
 * that no released binary has, and the update silently reaches nobody. #117
 * moved the fingerprint and that is exactly what would have happened.
 *
 * Nothing in the EAS CLI catches it. `eas update` has no flag that fails when
 * no compatible build exists, and `eas fingerprint:compare --build-id <id>
 * --json` exits 0 even when the two hashes differ, so a gate built on its exit
 * code is broken. What does work is comparing the fingerprint this tree
 * produces against the fingerprint of the build users actually have, which
 * {@link BASELINE_FILE} records.
 *
 * The comparison runs inside the publishing job's own `before_update` hook
 * rather than in a separate `type: fingerprint` job. Expo's docs warn twice
 * that a separate job's `environment` and `env` must be kept identical to the
 * publishing job or the hashes diverge, and this workflow sets `APP_VARIANT`
 * and `ANDROID_BUILD_ARCHS` through `env:`. Running in-process makes the
 * environment identical by construction instead of by maintenance, needs no
 * authenticated CLI on the worker, and adds no second VM. That is why
 * {@link generateFingerprint} inherits the ambient environment untouched: on
 * the worker the ambient environment is the publishing job's own, which is what
 * the update will be stamped with.
 *
 * It follows that a local run reads the shell it is run from. `app.config.js`
 * defaults `APP_VARIANT` to `development`, so checking `--profile production`
 * from a shell that has not exported `APP_VARIANT=production` compares the
 * wrong variant. The report prints the variant it used so a mismatch cannot be
 * misread.
 *
 * Every failure mode blocks. An unreadable baseline file, an unresolvable
 * expo-updates CLI, a non-zero `fingerprint:generate`, and unparseable output
 * are all reported and exit 1, because none of them establishes that the update
 * can reach anyone.
 *
 * Usage: node tools/verify-ota-compatibility.mjs --profile <profile> --platform <all|ios|android>
 */
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

/** The platforms a `--platform` value selects, or null if it names none. */
export function resolvePlatforms(platform) {
  if (platform === "all") return [...PLATFORMS];
  return PLATFORMS.includes(platform) ? [platform] : null;
}

/** The recorded released build, or null when no maintainer has recorded one.
 * An unknown profile is null rather than an error: an unrecorded release and an
 * unrecognised profile are the same situation, a publish with nothing to
 * compare against. */
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

/**
 * One record per platform, in the order given.
 *
 * `fingerprint(platform)` is injected so tests never shell out. It is awaited
 * for every platform, including one with no baseline, so `--platform all` never
 * reports on one platform while the other went unchecked and so a broken
 * toolchain surfaces on the run that broke it.
 */
export async function checkCompatibility({
  profile,
  platforms,
  baselines,
  fingerprint,
}) {
  return Promise.all(
    platforms.map(async (platform) => {
      const baseline = baselineFor(baselines, profile, platform);
      let localFingerprint = null;
      let reason = null;
      try {
        const hash = await fingerprint(platform);
        if (typeof hash === "string" && hash !== "") localFingerprint = hash;
        else reason = hashFailure(hash);
      } catch (error) {
        reason = error?.message ?? String(error);
      }
      const status =
        reason !== null
          ? "fingerprint-failed"
          : baseline === null
            ? "missing-baseline"
            : baseline.fingerprint === localFingerprint
              ? "match"
              : "mismatch";
      return { platform, profile, status, baseline, localFingerprint, reason };
    }),
  );
}

/** Anything but a match blocks, and so does an empty result set. */
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
      `Ship a new store build for ${result.platform}. No update can reach the`,
      "released binary, so users on it stay where they are until they",
      "upgrade through the store. If one is already out, record it in",
      `${BASELINE_PATH} instead.`,
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

/**
 * The hash out of `fingerprint:generate` stdout.
 *
 * The CLI prints `{"sources": [...], "hash": "..."}` and nothing else, but a
 * crashed or half-initialised run prints prose on stdout and still leaves the
 * caller holding a string. Parsing here rather than at the call site keeps that
 * one failure a reason the report can print.
 */
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

/**
 * The fingerprint of the working tree, as the publish about to run computes it.
 *
 * Every failure is rethrown with a reason the report can print, because the
 * caller renders it as a blocked platform. A bare stack trace would still exit
 * non-zero, but it would not say which platform is unverified or why.
 */
async function generateFingerprint(platform) {
  let cli;
  try {
    // expo-updates hoists to the workspace root, and apps/native has no
    // node_modules/.bin, so resolve it the way the module graph would.
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
    const stderr = firstLine(error.stderr ?? "");
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
