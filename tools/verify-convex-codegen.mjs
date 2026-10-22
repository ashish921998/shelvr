#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";

import { isMainModule } from "./main-module.mjs";

const CONVEX_DIR = "apps/native/convex";
const API_FILE = `${CONVEX_DIR}/_generated/api.d.ts`;

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
  if (
    (relPath.endsWith(".ts") || relPath.endsWith(".tsx")) &&
    !/^\s{0,100}(import|export)/m.test(readSource())
  ) {
    return false;
  }
  return true;
}

export function declaredModules(source) {
  const block = source.slice(source.indexOf("declare const fullApi"));
  return new Set(
    [...block.matchAll(/^\s+"?([A-Za-z0-9_./-]+)"?: typeof /gm)].map(
      (match) => match[1],
    ),
  );
}

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
