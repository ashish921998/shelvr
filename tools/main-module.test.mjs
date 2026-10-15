import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";

import { isMainModule } from "./main-module.mjs";

const HELPER = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "main-module.mjs"),
).href;

// A Linux tmpdir is a real path and a macOS one is not, so make the symlink
// here instead of depending on the platform for the case under test. Scripts
// are written under `real` and run through `linked`, which is how argv[1] and
// import.meta.url come to name one file by two paths.
const work = realpathSync(mkdtempSync(join(tmpdir(), "main-module-")));
const real = join(work, "real");
const linked = join(work, "link");
mkdirSync(real);
symlinkSync(real, linked);
after(() => rmSync(work, { recursive: true, force: true }));

function script(name, lines) {
  const path = join(real, name);
  writeFileSync(path, lines.join("\n"));
  return path;
}

// Prints the helper's answer and, beside it, the answer the string comparison
// this helper replaces would have given for the same file.
const subject = script("subject.mjs", [
  `import { isMainModule } from ${JSON.stringify(HELPER)};`,
  'import { pathToFileURL } from "node:url";',
  "const byString =",
  "  process.argv[1] &&",
  "  import.meta.url === pathToFileURL(process.argv[1]).href;",
  "console.log(",
  '  `subject realpath=${isMainModule(import.meta.url) ? "program" : "imported"}`,',
  '  `string=${byString ? "program" : "imported"}`,',
  ");",
]);

script("importer.mjs", [
  `import { isMainModule } from ${JSON.stringify(HELPER)};`,
  `await import(${JSON.stringify(pathToFileURL(subject).href)});`,
  "console.log(",
  '  `importer realpath=${isMainModule(import.meta.url) ? "program" : "imported"}`,',
  ");",
]);

const run = (name) =>
  execFileSync(process.execPath, [join(linked, name)], { encoding: "utf8" });

test("a script run through a symlinked path knows it is the program", () => {
  assert.equal(
    run("subject.mjs").trim(),
    "subject realpath=program string=imported",
  );
});

test("the same file, imported, is not the program", () => {
  assert.deepEqual(run("importer.mjs").trim().split("\n"), [
    "subject realpath=imported string=imported",
    "importer realpath=program",
  ]);
});

test("a module reached by import is not the program", () => {
  // This file imported the helper, so node was asked for this file, not it.
  assert.equal(isMainModule(HELPER), false);
});

// Replacing argv[1] is the only way to reach these from inside a test run.
function withEntry(entry, body) {
  const original = process.argv[1];
  process.argv[1] = entry;
  try {
    body();
  } finally {
    process.argv[1] = original;
  }
}

test("a path the filesystem cannot resolve throws instead of answering no", () => {
  withEntry(join(real, "deleted.mjs"), () => {
    assert.throws(() => isMainModule(HELPER), { code: "ENOENT" });
  });
});

test("node given no file to run has no program to compare against", () => {
  for (const entry of [undefined, ""]) {
    withEntry(entry, () => assert.equal(isMainModule(HELPER), false));
  }
});
