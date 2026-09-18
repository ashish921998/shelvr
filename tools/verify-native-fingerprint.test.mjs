import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  acknowledgementValues,
  diffSources,
  isAcknowledged,
  sourceKey,
} from "./verify-native-fingerprint.mjs";

const file = (filePath, hash, reasons = ["expoAutolinkingIos"]) => ({
  type: "dir",
  filePath,
  hash,
  reasons,
});
const contents = (id, hash, reasons = ["rncoreAutolinkingIos"]) => ({
  type: "contents",
  id,
  hash,
  reasons,
});

test("a file source is keyed by path and a contents source by id", () => {
  assert.equal(
    sourceKey(file("../../node_modules/expo-updates/ios", "a")),
    "../../node_modules/expo-updates/ios",
  );
  assert.equal(sourceKey(contents("expoConfig", "a")), "expoConfig");
});

test("a changed hash is reported under the source's key with its reasons", () => {
  const base = [
    file("../../node_modules/@posthog/react-native-plugin", "1111"),
    contents("rncoreAutolinkingConfig:ios", "2222"),
    contents("expoConfig", "3333", ["expoConfig"]),
  ];
  const head = [
    file("../../node_modules/@posthog/react-native-plugin", "aaaa"),
    contents("rncoreAutolinkingConfig:ios", "bbbb"),
    contents("expoConfig", "3333", ["expoConfig"]),
  ];
  assert.deepEqual(diffSources(base, head), {
    added: [],
    removed: [],
    changed: [
      {
        key: "../../node_modules/@posthog/react-native-plugin",
        reasons: ["expoAutolinkingIos"],
      },
      { key: "rncoreAutolinkingConfig:ios", reasons: ["rncoreAutolinkingIos"] },
    ],
  });
});

test("a source present on one side only is reported as added or removed", () => {
  const base = [file("../../node_modules/old-module/ios", "1111")];
  const head = [file("../../node_modules/new-module/ios", "2222")];
  assert.deepEqual(diffSources(base, head), {
    added: [
      {
        key: "../../node_modules/new-module/ios",
        reasons: ["expoAutolinkingIos"],
      },
    ],
    removed: [
      {
        key: "../../node_modules/old-module/ios",
        reasons: ["expoAutolinkingIos"],
      },
    ],
    changed: [],
  });
});

test("identical sources produce an empty diff", () => {
  const sources = [
    file("../../node_modules/expo-updates/ios", "1111"),
    contents("expoConfig", "2222"),
  ];
  assert.deepEqual(diffSources(sources, sources), {
    added: [],
    removed: [],
    changed: [],
  });
});

test("only the exact trailer value acknowledges", () => {
  assert.equal(isAcknowledged(["changed"]), true);
  assert.equal(isAcknowledged([" changed "]), true);
  assert.equal(isAcknowledged([]), false);
  assert.equal(isAcknowledged(["unchanged"]), false);
  assert.equal(isAcknowledged(["changed later"]), false);
});

const repo = mkdtempSync(join(tmpdir(), "fingerprint-trailer-"));
const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
const commit = (message) => git("commit", "-q", "--allow-empty", "-m", message);

git("init", "-q", "-b", "main");
git("config", "user.email", "test@example.com");
git("config", "user.name", "Test");
commit("base");
commit(
  [
    "docs: explain the guard",
    "",
    "Acknowledge an intended move with this line:",
    "Native-Fingerprint: changed",
    "",
    "That paragraph is prose, so it is not the trailer block.",
  ].join("\n"),
);
commit(
  ["Native-Fingerprint: changed", "", "A subject is not a trailer."].join("\n"),
);
commit(
  [
    "chore(native): update PostHog SDK",
    "",
    "Bumps the plugin, which moves the fingerprint.",
    "",
    "Native-Fingerprint: changed",
    "Co-Authored-By: Someone <someone@example.com>",
  ].join("\n"),
);

after(() => rmSync(repo, { recursive: true, force: true }));

test("prose and subjects that repeat the line do not acknowledge", () => {
  assert.deepEqual(acknowledgementValues(repo, "HEAD~3..HEAD~1"), []);
});

test("a trailer in the final block acknowledges", () => {
  assert.deepEqual(acknowledgementValues(repo, "HEAD~1..HEAD"), ["changed"]);
});

test("a range with no commits acknowledges nothing", () => {
  assert.deepEqual(acknowledgementValues(repo, "HEAD..HEAD"), []);
});
