import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const nativeRequire = createRequire(
  new URL("../apps/native/package.json", import.meta.url),
);

test("Glob finds nested source files and respects ignored directories after the matcher upgrade", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "shelvr-glob-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const path of [
    "src/index.ts",
    "src/lib/place.ts",
    "src/lib/place.test.ts",
    "src/.hidden.ts",
    "node_modules/pkg/index.ts",
  ]) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), "");
  }
  const { glob, globSync } = nativeRequire("glob");
  const options = {
    cwd,
    dot: true,
    ignore: ["**/node_modules/**", "**/*.test.ts"],
  };
  const expected = ["src/.hidden.ts", "src/index.ts", "src/lib/place.ts"];
  assert.deepEqual(globSync("**/*.ts", options).sort(), expected);
  assert.deepEqual((await glob("**/*.ts", options)).sort(), expected);
});

test("Expo fingerprint keeps ordered ignore rules and nested native files", () => {
  const { isIgnoredPath } = nativeRequire(
    "@expo/fingerprint/build/utils/Path.js",
  );
  const patterns = ["**/*.ts", "!modules/**", "**/*.test.ts"];
  assert.equal(isIgnoredPath("src/lib/place.ts", patterns), true);
  assert.equal(isIgnoredPath("modules/maps/index.ts", patterns), false);
  assert.equal(isIgnoredPath("modules/maps/index.test.ts", patterns), false);
  assert.equal(isIgnoredPath("src/lib/place.test.ts", patterns), true);
  assert.equal(isIgnoredPath("modules/maps/.generated.ts", patterns), false);
});
