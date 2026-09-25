import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { after, test } from "node:test";

import {
  declaredModules,
  discoverModules,
  drift,
} from "./verify-convex-codegen.mjs";

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A convex directory on disk. Files are written for real rather than mocked,
 * because the rules under test are about filenames and contents. */
function convexDir(files) {
  const root = mkdtempSync(join(tmpdir(), "codegen-guard-"));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

const MODULE = "export const noop = 1;\n";

test("finds modules at the root and in subdirectories", () => {
  const root = convexDir({ "ai.ts": MODULE, "model/auth.ts": MODULE });
  assert.deepEqual(discoverModules(root).sort(), ["ai", "model/auth"]);
});

// The two cases reported on #119. A `.d.ts` has two dots, so Convex never adds
// it to the inventory and demanding an entry fails a branch that regenerating
// cannot fix. A `.js` is a real module, so ignoring it lets drift through.
test("does not demand an entry for a .d.ts, which Convex skips", () => {
  const root = convexDir({ "ai.ts": MODULE, "types.d.ts": "export type A = 1;" });
  assert.deepEqual(discoverModules(root), ["ai"]);
});

test("catches a .js module, which Convex bundles", () => {
  const root = convexDir({ "legacy.js": MODULE });
  assert.deepEqual(discoverModules(root), ["legacy"]);
});

test("catches every extension esbuild accepts as an entry point", () => {
  const root = convexDir({
    "a.js": MODULE,
    "b.mjs": MODULE,
    "c.cjs": MODULE,
    "d.ts": MODULE,
    "e.tsx": MODULE,
    "f.mts": MODULE,
    "g.cts": MODULE,
    "h.jsx": MODULE,
  });
  assert.equal(discoverModules(root).length, 8);
});

test("skips the names Convex reserves and the generated directory", () => {
  const root = convexDir({
    "ai.ts": MODULE,
    "schema.ts": MODULE,
    "_generated/api.d.ts": MODULE,
    "_generated/server.js": MODULE,
  });
  assert.deepEqual(discoverModules(root), ["ai"]);
});

// One rule, not four: the dotted names this repo excludes by hand are all just
// Convex's multiple-dots rule.
test("skips any filename with more than one dot", () => {
  const root = convexDir({
    "ai.ts": MODULE,
    "auth.config.ts": MODULE,
    "convex.config.ts": MODULE,
    "test.setup.ts": MODULE,
    "items.test.ts": MODULE,
  });
  assert.deepEqual(discoverModules(root), ["ai"]);
});

test("skips dotfiles, emacs tempfiles and paths containing a space", () => {
  const root = convexDir({
    "ai.ts": MODULE,
    ".hidden.ts": MODULE,
    "#tmp.ts": MODULE,
    "has space.ts": MODULE,
    "sub dir/nested.ts": MODULE,
  });
  assert.deepEqual(discoverModules(root), ["ai"]);
});

test("skips a TypeScript file with no import or export", () => {
  const root = convexDir({ "ai.ts": MODULE, "notes.ts": "const x = 1;\n" });
  assert.deepEqual(discoverModules(root), ["ai"]);
});

test("keeps a JavaScript file with no import or export, as Convex does", () => {
  const root = convexDir({ "legacy.js": "const x = 1;\n" });
  assert.deepEqual(discoverModules(root), ["legacy"]);
});

test("skips a nested component directory, which Convex bundles separately", () => {
  const root = convexDir({
    "ai.ts": MODULE,
    "widget/convex.config.ts": MODULE,
    "widget/index.ts": MODULE,
  });
  assert.deepEqual(discoverModules(root), ["ai"]);
});

test("reads both quoted and bare module keys out of api.d.ts", () => {
  const declared = declaredModules(`
declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  "model/auth": typeof model_auth;
}>;
`);
  assert.deepEqual([...declared].sort(), ["ai", "model/auth"]);
});

test("reports drift in both directions", () => {
  const { missing, stale } = drift(new Set(["ai", "gone"]), ["ai", "added"]);
  assert.deepEqual(missing, ["added"]);
  assert.deepEqual(stale, ["gone"]);
});

test("reports no drift when the inventory matches the tree", () => {
  const { missing, stale } = drift(new Set(["ai", "model/auth"]), [
    "model/auth",
    "ai",
  ]);
  assert.deepEqual(missing, []);
  assert.deepEqual(stale, []);
});
