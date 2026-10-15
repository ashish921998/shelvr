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
const BACKEND_HEADING = "### Backend";
const NATIVE_HEADING = "### Native";

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
 * `list(relDir)` reads a directory relative to `(app)` with file types; `""`
 * is `(app)` itself. Directories are walked to any depth, except that a tab
 * is one route named without the `(tabs)` prefix, whether it is a group
 * directory or a single screen file, and a group's inner screens are not listed.
 */
export function appRoutes(list, relDir = "") {
  const routes = [];
  for (const entry of list(relDir)) {
    if (entry.name.startsWith("_") || entry.name.startsWith("+")) continue;
    const inTabs = relDir === "(tabs)";
    const path = relDir && !inTabs ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (inTabs) routes.push(entry.name);
      else routes.push(...appRoutes(list, path));
    } else if (entry.name.endsWith(".tsx")) {
      const route = path.slice(0, -4);
      routes.push(route.endsWith("/index") ? route.slice(0, -6) : route);
    }
  }
  return routes;
}

/**
 * The text under a markdown heading, up to the next heading of the same or a
 * higher level. Empty when the heading is gone, so every name scoped to it is
 * then reported and the rename cannot pass unnoticed.
 */
export function section(doc, heading) {
  const start = doc.indexOf(`\n${heading}`);
  if (start === -1) return "";
  const level = heading.match(/^#+/)[0].length;
  const rest = doc.slice(start + 1 + heading.length);
  const end = rest.search(new RegExp(`^#{1,${level}} `, "m"));
  return end === -1 ? rest : rest.slice(0, end);
}

/** Names the text never writes in backticks, alone or as the end of a path
 * (`items.ts` and `convex/items.ts` both count). */
export function undocumented(text, names) {
  return names
    .filter(
      (name) => !text.includes(`\`${name}\``) && !text.includes(`/${name}\``),
    )
    .sort();
}

function main() {
  const doc = readFileSync(DOC, "utf8");
  const dirents = (dir) => readdirSync(dir, { withFileTypes: true });
  // Tables and routes are common words (`items`, `import`), so each is looked
  // for only in the section that lists it. Module filenames are specific
  // enough to match anywhere in the doc.
  const groups = [
    {
      label: "Schema tables",
      where: BACKEND_HEADING,
      text: section(doc, BACKEND_HEADING),
      names: schemaTables(readFileSync(join(CONVEX_DIR, "schema.ts"), "utf8")),
    },
    {
      label: "Convex modules",
      where: DOC,
      text: doc,
      names: convexModules(readdirSync(CONVEX_DIR)),
    },
    {
      label: "App routes",
      where: NATIVE_HEADING,
      text: section(doc, NATIVE_HEADING),
      names: appRoutes((relDir) => dirents(join(APP_ROUTES_DIR, relDir))),
    },
  ];

  let total = 0;
  let failed = false;
  for (const { label, where, text, names } of groups) {
    total += names.length;
    const missing = undocumented(text, names);
    if (missing.length === 0) continue;
    if (!failed) console.error(`${DOC} is missing names from the tree.\n`);
    failed = true;
    console.error(`${label} (looked in "${where}"):`);
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
