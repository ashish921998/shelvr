import assert from "node:assert/strict";
import { test } from "node:test";

import {
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

test("the acknowledgement trailer is recognised on its own line", () => {
  const log = [
    "chore(native): update PostHog SDK",
    "",
    "Native-Fingerprint: changed",
    "Co-Authored-By: Someone <someone@example.com>",
  ].join("\n");
  assert.equal(isAcknowledged(log), true);
});

test("a log without the trailer is not an acknowledgement", () => {
  assert.equal(
    isAcknowledged("chore(native): update PostHog SDK\n\nBumps the plugin.\n"),
    false,
  );
  assert.equal(isAcknowledged("Native-Fingerprint: unchanged\n"), false);
  assert.equal(
    isAcknowledged("mentions Native-Fingerprint: changed mid sentence\n"),
    false,
  );
  assert.equal(isAcknowledged(""), false);
});
