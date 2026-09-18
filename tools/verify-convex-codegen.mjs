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
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const CONVEX_DIR = "apps/native/convex";
const API_FILE = `${CONVEX_DIR}/_generated/api.d.ts`;

/** Files under `convex/` that are real modules but are deliberately absent from
 * the inventory. `schema.ts` and the `*.config.ts` pair are names Convex
 * reserves for itself; `test.setup.ts` and `*.test.ts` are test-only and never
 * deployed. Derived by diffing the inventory against the tree, so a Convex
 * release that changes these rules fails this check loudly rather than letting
 * drift back in. */
function isExcluded(modulePath) {
  return (
    modulePath === "schema" ||
    modulePath === "test.setup" ||
    modulePath.endsWith(".config") ||
    modulePath.endsWith(".test")
  );
}

/** The module paths `api.d.ts` declares, e.g. `ai` and `model/recipeMarkup`.
 * Keys are bare identifiers unless the path needs quoting. */
function declaredModules(source) {
  const block = source.slice(source.indexOf("declare const fullApi"));
  return new Set(
    [...block.matchAll(/^\s+"?([A-Za-z0-9_./-]+)"?: typeof /gm)].map(
      (match) => match[1],
    ),
  );
}

function moduleFilesOnDisk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "_generated") found.push(...moduleFilesOnDisk(path));
    } else if (entry.name.endsWith(".ts")) {
      found.push(relative(CONVEX_DIR, path).replace(/\.ts$/, ""));
    }
  }
  return found;
}

const declared = declaredModules(readFileSync(API_FILE, "utf8"));
const onDisk = moduleFilesOnDisk(CONVEX_DIR).filter(
  (path) => !isExcluded(path),
);

const missing = onDisk.filter((path) => !declared.has(path)).sort();
const stale = [...declared].filter((path) => !onDisk.includes(path)).sort();

if (missing.length === 0 && stale.length === 0) {
  console.log(
    `convex codegen: ${declared.size} modules, inventory matches the tree`,
  );
  process.exit(0);
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
process.exit(1);
