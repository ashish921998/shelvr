import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const nativeRequire = createRequire(
  new URL("../apps/native/package.json", import.meta.url),
);

function atLeast(version, minimum) {
  const parts = version.split(".").map(Number);
  for (let i = 0; i < minimum.length; i += 1) {
    if (parts[i] !== minimum[i]) return parts[i] > minimum[i];
  }
  return true;
}

test("the Expo CLI Zod exception never permits vulnerable application validators", () => {
  const { version } = nativeRequire("zod/package.json");
  assert.ok(
    atLeast(version, [4, 6, 6]),
    "Upgrade the app's Zod to 4.6.6 or newer; the audit exception is only for Expo CLI's Zod 3.",
  );
});

test("the application's HTTP client includes the content-encoding fix", () => {
  const { version } = nativeRequire("undici/package.json");
  assert.ok(atLeast(version, [7, 30, 1]), "Upgrade Undici to 7.30.1 or newer.");
});
