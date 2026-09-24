#!/usr/bin/env node
/**
 * Fail when `convex/_generated/api.d.ts` no longer lists every Convex module on
 * disk.
 *
 * Convex writes that file, and this repo commits it, but nothing regenerates it
 * in CI: the `check` job installs, lints, typechecks and tests, and `convex
 * codegen` is the only thing that rewrites it. So a branch that adds a module
 * without running `convex dev` merges with a stale inventory. PR #82 did, and it
 * surfaced a day later when a production deploy ran codegen as one of its steps
 * and dirtied the working tree.
 *
 * `tsc` cannot catch it. Convex builds the generated API type through
 * `ApiFromModules`, which only reaches registered queries, mutations and
 * actions, so a module of plain helpers (`model/recipeMarkup`) is invisible to
 * the type graph and typechecking passes either way.
 *
 * Running real codegen here is not an option: it authenticates and checks
 * project access ("You don't have access to the selected project"), so it would
 * need deployment credentials in every pull-request job, which fork PRs cannot
 * have anyway. Comparing the committed inventory against the filesystem needs
 * no credentials, no network, and runs in milliseconds.
 *
 * What it does need is Convex's own idea of which files are modules, mirrored
 * exactly. Guessing that set gets it wrong in both directions: a `types.d.ts`
 * is not a module, so demanding an entry for it fails a branch that regenerating
 * cannot fix, and a `.js` module is one, so ignoring it lets the drift this
 * exists to catch straight through. {@link isEntryPoint} is a transcription of
 * `entryPoints()` in `convex/dist/esm/bundler/index.js`, pinned at 1.43.0.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";

import { isMainModule } from "./main-module.mjs";

const CONVEX_DIR = "apps/native/convex";
const API_FILE = `${CONVEX_DIR}/_generated/api.d.ts`;

/** Extensions esbuild can take as an entry point, as Convex lists them. Note
 * `.js` and friends: a Convex module does not have to be TypeScript, and a
 * guard that only walks `.ts` misses one entirely. */
const ENTRY_POINT_EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".jsx",
];

/**
 * Whether Convex would treat this file as a module, given its path relative to
 * the convex directory and its contents.
 *
 * Every rule below is Convex's, in Convex's order. The one worth calling out is
 * the multiple-dots rule, which is why `schema.ts` needs its own line while
 * `auth.config.ts`, `convex.config.ts`, `test.setup.ts` and every `*.test.ts`
 * need none: they are all already excluded for having two dots in the filename.
 */
export function isEntryPoint(relPath, readSource) {
  const base = basename(relPath);
  if (!ENTRY_POINT_EXTENSIONS.some((ext) => relPath.endsWith(ext)))
    return false;
  if (relPath.startsWith("_generated/")) return false;
  if (base.startsWith(".")) return false;
  if (base.startsWith("#")) return false;
  if (base === "schema.ts" || base === "schema.js") return false;
  if ((base.match(/\./g) || []).length > 1) return false;
  if (relPath.includes(" ")) return false;
  // A TypeScript file with no top-level import or export is not a module, so
  // Convex drops it after the path rules rather than during them. `readSource`
  // is a thunk because every rule above decides on the path alone, and most
  // files never get this far — no reason to read them off disk.
  if (
    (relPath.endsWith(".ts") || relPath.endsWith(".tsx")) &&
    !/^\s{0,100}(import|export)/m.test(readSource())
  ) {
    return false;
  }
  return true;
}

/** The module paths `api.d.ts` declares, e.g. `ai` and `model/recipeMarkup`.
 * Keys are bare identifiers unless the path needs quoting. */
export function declaredModules(source) {
  const block = source.slice(source.indexOf("declare const fullApi"));
  return new Set(
    [...block.matchAll(/^\s+"?([A-Za-z0-9_./-]+)"?: typeof /gm)].map(
      (match) => match[1],
    ),
  );
}

/** Every module path Convex would bundle out of `dir`, extension stripped. */
export function discoverModules(
  dir,
  readFile = readFileSync,
  exists = existsSync,
) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        // A directory with its own convex.config.ts is a nested component, and
        // Convex bundles it separately rather than as part of this app.
        if (!exists(join(path, "convex.config.ts"))) walk(path);
        continue;
      }
      const relPath = relative(dir, path).split("\\").join("/");
      const ext = ENTRY_POINT_EXTENSIONS.find((e) => relPath.endsWith(e));
      if (ext === undefined) continue;
      if (!isEntryPoint(relPath, () => readFile(path, "utf8"))) continue;
      found.push(relPath.slice(0, -ext.length));
    }
  };
  walk(dir);
  return found;
}

export function drift(declared, onDisk) {
  return {
    missing: onDisk.filter((path) => !declared.has(path)).sort(),
    stale: [...declared].filter((path) => !onDisk.includes(path)).sort(),
  };
}

function main() {
  const declared = declaredModules(readFileSync(API_FILE, "utf8"));
  const onDisk = discoverModules(CONVEX_DIR);
  const { missing, stale } = drift(declared, onDisk);

  if (missing.length === 0 && stale.length === 0) {
    console.log(
      `convex codegen: ${declared.size} modules, inventory matches the tree`,
    );
    return 0;
  }

  console.error(`${API_FILE} is out of date.\n`);
  if (missing.length > 0) {
    console.error("On disk but not in the inventory:");
    for (const path of missing) console.error(`  ${path}`);
  }
  if (stale.length > 0) {
    console.error("In the inventory but no longer on disk:");
    for (const path of stale) console.error(`  ${path}`);
  }
  console.error(
    "\nRegenerate it and commit the result:\n" +
      "  pnpm --filter native-app exec convex codegen\n" +
      "(`convex dev` also rewrites it. Both need Convex credentials, which is why\n" +
      "CI compares the committed file instead of regenerating it.)",
  );
  return 1;
}

if (isMainModule(import.meta.url)) {
  process.exit(main());
}

export { CONVEX_DIR, API_FILE };
