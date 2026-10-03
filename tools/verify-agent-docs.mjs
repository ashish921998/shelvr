#!/usr/bin/env node
/**
 * Fail when `CLAUDE.md` no longer names every schema table, top-level Convex
 * module and `(app)` route in the tree.
 *
 * `CLAUDE.md` is the map agents read before they search. It listed 14 of 18
 * tables, left out six Convex modules and two routes, and nothing noticed:
 * agents grepped for what the map did not mention. A missing name is cheap to
 * detect, so detect it.
 *
 * This checks presence only. It cannot tell whether the sentence around a name
 * is still true, and it does not flag a name in the doc that has left the tree.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { isMainModule } from "./main-module.mjs";

const DOC = "CLAUDE.md";
const CONVEX_DIR = "apps/native/convex";
const APP_ROUTES_DIR = "apps/native/src/app/(app)";

/** Table names declared in `schema.ts`. */
export function schemaTables(source) {
  return [...source.matchAll(/^\s{2}(\w+): defineTable\(/gm)].map(
    (match) => match[1],
  );
}

/** Top-level Convex modules, tests excluded. */
export function convexModules(fileNames) {
  return fileNames.filter(
    (name) => name.endsWith(".ts") && !name.includes(".test."),
  );
}

/**
 * Route names under `(app)` as `CLAUDE.md` writes them: `add` for `add.tsx`,
 * `item/[id]` for `item/[id].tsx`, `(home)` for the `(tabs)/(home)` group.
 * `entries` is a `readdirSync(..., { withFileTypes: true })` listing and
 * `list` reads a subdirectory the same way.
 */
export function appRoutes(entries, list) {
  const routes = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith("+")) continue;
    if (!entry.isDirectory()) {
      if (entry.name.endsWith(".tsx")) routes.push(entry.name.slice(0, -4));
      continue;
    }
    for (const child of list(entry.name)) {
      if (child.name.startsWith("_")) continue;
      if (entry.name === "(tabs)") {
        if (child.isDirectory()) routes.push(child.name);
      } else if (child.name.endsWith(".tsx")) {
        const leaf = child.name.slice(0, -4);
        routes.push(leaf === "index" ? entry.name : `${entry.name}/${leaf}`);
      }
    }
  }
  return routes;
}

/** Names the doc never writes in backticks, alone or as the end of a path
 * (`items.ts` and `convex/items.ts` both count). */
export function undocumented(doc, names) {
  return names
    .filter(
      (name) => !doc.includes(`\`${name}\``) && !doc.includes(`/${name}\``),
    )
    .sort();
}

function main() {
  const doc = readFileSync(DOC, "utf8");
  const dirents = (dir) => readdirSync(dir, { withFileTypes: true });
  const groups = {
    "Schema tables": schemaTables(
      readFileSync(join(CONVEX_DIR, "schema.ts"), "utf8"),
    ),
    "Convex modules": convexModules(readdirSync(CONVEX_DIR)),
    "App routes": appRoutes(dirents(APP_ROUTES_DIR), (name) =>
      dirents(join(APP_ROUTES_DIR, name)),
    ),
  };

  let total = 0;
  let failed = false;
  for (const [label, names] of Object.entries(groups)) {
    total += names.length;
    const missing = undocumented(doc, names);
    if (missing.length === 0) continue;
    if (!failed) console.error(`${DOC} is missing names from the tree.\n`);
    failed = true;
    console.error(`${label}:`);
    for (const name of missing) console.error(`  ${name}`);
  }
  if (failed) {
    console.error(
      `\nAdd each one to ${DOC} in backticks, with a line on what it is for.`,
    );
    return 1;
  }
  console.log(`agent docs: ${DOC} names all ${total} tables, modules, routes`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(main());
}
