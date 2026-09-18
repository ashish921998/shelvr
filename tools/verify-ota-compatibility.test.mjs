import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASELINE_PATH,
  baselineFor,
  checkCompatibility,
  formatReport,
  isBlocked,
  readFingerprintHash,
  resolvePlatforms,
} from "./verify-ota-compatibility.mjs";

const RELEASED_IOS = {
  buildId: "a32a658b-d52b-4a1f-8e75-766863232278",
  fingerprint: "d17342dbios",
  release: "1.0.3 (27), App Store, released 2026-09-15",
};
const RELEASED_ANDROID = {
  buildId: "8f60c55c-7001-4dd3-8251-a9ba352699de",
  fingerprint: "b80eb4a9android",
  release: "1.0.3 (14), Google Play, released 2026-09-17",
};

const BASELINES = {
  production: { ios: RELEASED_IOS, android: RELEASED_ANDROID },
  preview: { ios: null, android: null },
};

/** A stand-in for the expo-updates CLI. A platform mapped to an Error rejects,
 * which is how every real failure reaches {@link checkCompatibility}. */
const fingerprinter = (hashes) => async (platform) => {
  const hash = hashes[platform];
  if (hash instanceof Error) throw hash;
  return hash;
};

const check = (profile, platforms, hashes) =>
  checkCompatibility({
    profile,
    platforms,
    baselines: BASELINES,
    fingerprint: fingerprinter(hashes),
  });

test("all selects both platforms and an unknown value selects none", () => {
  assert.deepEqual(resolvePlatforms("all"), ["ios", "android"]);
  assert.deepEqual(resolvePlatforms("ios"), ["ios"]);
  assert.deepEqual(resolvePlatforms("android"), ["android"]);
  assert.equal(resolvePlatforms("web"), null);
  assert.equal(resolvePlatforms(""), null);
});

test("an unrecorded release and an unknown profile both read as no baseline", () => {
  assert.equal(baselineFor(BASELINES, "production", "ios"), RELEASED_IOS);
  assert.equal(baselineFor(BASELINES, "preview", "ios"), null);
  assert.equal(baselineFor(BASELINES, "internal-test", "ios"), null);
  assert.equal(baselineFor({}, "production", "ios"), null);
});

test("a tree whose fingerprint equals the released build's is not blocked", async () => {
  const results = await check("production", ["ios"], {
    ios: RELEASED_IOS.fingerprint,
  });
  assert.deepEqual(
    results.map((r) => [r.platform, r.status]),
    [["ios", "match"]],
  );
  assert.equal(isBlocked(results), false);
  assert.match(formatReport(results), /ios {7}match/);
});

test("both platforms matching under --platform all is not blocked", async () => {
  const results = await check("production", ["ios", "android"], {
    ios: RELEASED_IOS.fingerprint,
    android: RELEASED_ANDROID.fingerprint,
  });
  assert.deepEqual(
    results.map((r) => r.status),
    ["match", "match"],
  );
  assert.equal(isBlocked(results), false);
});

test("a moved fingerprint blocks and the report carries both hashes", async () => {
  const results = await check("production", ["ios"], { ios: "movedbythesdk" });
  assert.equal(results[0].status, "mismatch");
  assert.equal(isBlocked(results), true);

  const report = formatReport(results);
  assert.match(report, /ios {7}MISMATCH/);
  assert.ok(report.includes(RELEASED_IOS.buildId), "names the released build");
  assert.ok(report.includes(RELEASED_IOS.release), "names the release");
  assert.ok(report.includes(RELEASED_IOS.fingerprint), "the build's hash");
  assert.ok(report.includes("movedbythesdk"), "the tree's hash");
  assert.match(report, /new store build for ios/);
});

test("a platform with no recorded release blocks and names the registry", async () => {
  const results = await check("preview", ["android"], { android: "anyhash" });
  assert.equal(results[0].status, "missing-baseline");
  assert.equal(results[0].baseline, null);
  assert.equal(isBlocked(results), true);

  const report = formatReport(results);
  assert.match(report, /android {3}NO BASELINE RECORDED/);
  assert.ok(report.includes(BASELINE_PATH), "names the file to edit");
  assert.ok(report.includes("eas fingerprint:compare"), "names how to read it");
});

test("an unrecognised profile blocks rather than passing unchecked", async () => {
  const results = await check("staging", ["ios"], { ios: "anyhash" });
  assert.equal(results[0].status, "missing-baseline");
  assert.equal(isBlocked(results), true);
  assert.ok(formatReport(results).includes(`"staging" in ${BASELINE_PATH}`));
});

test("a fingerprint that rejects blocks and the report carries the reason", async () => {
  const results = await check("production", ["ios"], {
    ios: new Error("cannot resolve the expo-updates CLI from apps/native"),
  });
  assert.equal(results[0].status, "fingerprint-failed");
  assert.equal(results[0].localFingerprint, null);
  assert.equal(isBlocked(results), true);

  const report = formatReport(results);
  assert.match(report, /ios {7}FINGERPRINT FAILED/);
  assert.ok(report.includes("cannot resolve the expo-updates CLI"));
});

test("an empty or non-string hash blocks rather than matching nothing", async () => {
  for (const [hash, expected] of [
    ["", /empty hash/],
    [undefined, /produced a undefined/],
    [null, /produced a null/],
  ]) {
    const results = await check("production", ["ios"], { ios: hash });
    assert.equal(results[0].status, "fingerprint-failed");
    assert.equal(isBlocked(results), true);
    assert.match(formatReport(results), expected);
  }
});

test("output that is not JSON is rejected with the text it printed", () => {
  assert.throws(
    () => readFingerprintHash("Error: EACCES, open '.expo'\n", "ios"),
    /not JSON.*EACCES/s,
  );
  assert.throws(() => readFingerprintHash("", "android"), /not JSON/);
});

test("JSON without a hash field is not treated as a hash", () => {
  assert.equal(readFingerprintHash('{"sources":[]}', "ios"), undefined);
  assert.equal(readFingerprintHash('{"hash":"abc123"}', "ios"), "abc123");
});

test("one platform matching does not excuse the other under --platform all", async () => {
  const results = await check("production", ["ios", "android"], {
    ios: RELEASED_IOS.fingerprint,
    android: "movedbythesdk",
  });
  assert.deepEqual(
    results.map((r) => [r.platform, r.status]),
    [
      ["ios", "match"],
      ["android", "mismatch"],
    ],
  );
  assert.equal(isBlocked(results), true);

  const report = formatReport(results);
  assert.match(report, /ios {7}match/);
  assert.match(report, /android {3}MISMATCH/);
});

test("a failure on one platform still reports the other", async () => {
  const results = await check("production", ["ios", "android"], {
    ios: new Error("fingerprint:generate failed"),
    android: RELEASED_ANDROID.fingerprint,
  });
  assert.deepEqual(
    results.map((r) => r.status),
    ["fingerprint-failed", "match"],
  );
  assert.equal(isBlocked(results), true);
});

test("checking nothing blocks", () => {
  assert.equal(isBlocked([]), true);
});
