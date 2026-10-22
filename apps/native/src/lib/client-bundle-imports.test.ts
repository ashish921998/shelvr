import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(APP, "src");
const CONVEX = join(APP, "convex");

// Server-only packages. Each one reached from `src/` through `@convex/...`
// ships in the app bundle and runs at launch, because Expo Router loads every
// route up front. zod alone added about 400 KB of bytecode that way.
const SERVER_ONLY = [
  /^zod(\/|$)/,
  /^ai$/,
  /^@ai-sdk\//,
  /^linkedom/,
  /^@mozilla\/readability/,
  /^jose/,
  /^undici/,
  /^node:/,
  /^@convex-dev\/auth\/server/,
  /^@convex-dev\/rate-limiter/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// `import { type A, type B } from "x"` names only types, so it is erased too.
function onlyInlineTypes(clause: string): boolean {
  const named = /^\s*\{([^}]*)\}\s*$/.exec(clause);
  if (named === null) return false;
  const names = named[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 && names.every((name) => name.startsWith("type "));
}

/** Specifiers of imports that survive compilation (`import type` is erased). */
function runtimeImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  const declaration =
    /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:([^"';]*?)\sfrom\s+)?["']([^"']+)["']/g;
  for (const [, typeOnly, clause, specifier] of text.matchAll(declaration)) {
    if (typeOnly === undefined && !onlyInlineTypes(clause ?? "")) {
      specifiers.push(specifier);
    }
  }
  const call = /\b(?:import|require)\(\s*["']([^"']+)["']\s*\)/g;
  for (const [, specifier] of text.matchAll(call)) specifiers.push(specifier);
  return specifiers;
}

function resolveConvex(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@convex/")
    ? join(CONVEX, specifier.slice("@convex/".length))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (base === undefined || !base.startsWith(CONVEX)) return undefined;
  for (const candidate of [
    `${base}.ts`,
    `${base}.js`,
    join(base, "index.ts"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next extension
    }
  }
  return undefined;
}

function serverImportsReachableFromApp(): string[] {
  const seen = new Set<string>();
  const queue: { file: string; via: string[] }[] = [];
  for (const file of sourceFiles(SRC)) {
    for (const specifier of runtimeImports(file)) {
      const target = resolveConvex(file, specifier);
      if (target) queue.push({ file: target, via: [relative(APP, file)] });
    }
  }
  const found: string[] = [];
  while (queue.length > 0) {
    const { file, via } = queue.shift()!;
    if (seen.has(file) || file.includes("/_generated/")) continue;
    seen.add(file);
    const chain = [...via, relative(APP, file)];
    for (const specifier of runtimeImports(file)) {
      if (SERVER_ONLY.some((re) => re.test(specifier))) {
        found.push(`${chain.join(" -> ")} -> ${specifier}`);
      }
      const next = resolveConvex(file, specifier);
      if (next) queue.push({ file: next, via: chain });
    }
  }
  return found;
}

describe("convex modules the app imports", () => {
  it("never pull a server-only package into the app bundle", () => {
    expect(serverImportsReachableFromApp()).toEqual([]);
  });
});
