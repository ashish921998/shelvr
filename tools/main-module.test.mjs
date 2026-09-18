import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";

import { isMainModule } from "./main-module.mjs";

const HELPER = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "main-module.mjs"),
).href;

// mkdtemp hands back a path under /var, which is a symlink to /private/var, so
// a script run from here is exactly the case the string idiom gets wrong.
const work = mkdtempSync(join(tmpdir(), "main-module-"));
after(() => rmSync(work, { recursive: true, force: true }));

function script(name, lines) {
  const path = join(work, name);
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

const importer = script("importer.mjs", [
  `import { isMainModule } from ${JSON.stringify(HELPER)};`,
  `await import(${JSON.stringify(pathToFileURL(subject).href)});`,
  "console.log(",
  '  `importer realpath=${isMainModule(import.meta.url) ? "program" : "imported"}`,',
  ");",
]);

const run = (path) =>
  execFileSync(process.execPath, [path], { encoding: "utf8" });

test("a script run through a symlinked path knows it is the program", () => {
  assert.ok(
    work.startsWith("/var/"),
    `expected a symlinked tmpdir, got ${work}`,
  );
  assert.equal(run(subject).trim(), "subject realpath=program string=imported");
});

test("the same file, imported, is not the program", () => {
  assert.deepEqual(run(importer).trim().split("\n"), [
    "subject realpath=imported string=imported",
    "importer realpath=program",
  ]);
});

test("a module reached by import is not the program", () => {
  // This file imported the helper, so node was asked for this file, not it.
  assert.equal(isMainModule(HELPER), false);
});
