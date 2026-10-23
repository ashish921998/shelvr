/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { isAuthedFunction } from "./auth";
import { NOT_MOVED_YET, PUBLIC_ON_PURPOSE } from "./publicFunctions";

const modules = import.meta.glob("../**/*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}");

const FIX =
  "use authedQuery or authedMutation from model/auth.ts. If it must answer a signed-out or deleting caller, add it to PUBLIC_ON_PURPOSE in model/publicFunctions.ts with a reason.";

/** Convex registers a file under convex/ as a module unless it is generated or its name has two dots (tests, configs). */
function moduleName(path: string): string | null {
  const relative = path.replace(/^\.\.\//, "");
  if (relative.startsWith("_generated/")) return null;
  const file = relative.slice(relative.lastIndexOf("/") + 1);
  if (file.split(".").length > 2) return null;
  return relative.replace(/\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/, "");
}

type Flags = { isPublic?: unknown; isQuery?: unknown; isMutation?: unknown };

function isPublicQueryOrMutation(value: unknown): boolean {
  if (
    typeof value !== "function" &&
    (typeof value !== "object" || value === null)
  )
    return false;
  const flags = value as Flags;
  return (
    flags.isPublic === true &&
    (flags.isQuery === true || flags.isMutation === true)
  );
}

async function publicQueriesAndMutations(): Promise<Map<string, unknown>> {
  const found = new Map<string, unknown>();
  for (const [path, load] of Object.entries(modules)) {
    const name = moduleName(path);
    if (name === null) continue;
    const loaded = (await load()) as Record<string, unknown>;
    for (const [exported, value] of Object.entries(loaded)) {
      if (isPublicQueryOrMutation(value))
        found.set(`${name}:${exported}`, value);
    }
  }
  return found;
}

/** A ctx with only what `requireUserId` reads; any other read throws, so a handler that reaches the database before refusing the caller fails. */
function ctxStub(members: object): object {
  return new Proxy(members, {
    get(target, property) {
      if (typeof property === "symbol" || property in target) {
        return Reflect.get(target, property);
      }
      throw new Error(`read ctx.${property} before requireUserId`);
    },
  });
}

const REFUSED_CALLERS: readonly [string, object][] = [
  [
    "a signed-out caller",
    ctxStub({ auth: { getUserIdentity: async () => null } }),
  ],
  [
    "a deleting account",
    ctxStub({
      auth: { getUserIdentity: async () => ({ subject: "user|session" }) },
      db: { normalizeId: () => "user", get: async () => ({ deleting: true }) },
    }),
  ],
];

type Handler = (ctx: unknown, args: unknown) => unknown;

/** Why `fn` does not open with `await requireUserId(ctx)`, or null when it refuses both callers first. */
async function skipsHandAuth(fn: unknown): Promise<string | null> {
  const handler = (fn as { _handler?: Handler })._handler;
  if (typeof handler !== "function") return "has no handler to call";
  for (const [caller, ctx] of REFUSED_CALLERS) {
    try {
      await handler(ctx, {});
      return `answered ${caller}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== "Not authenticated") {
        return `did not refuse ${caller} first (${message})`;
      }
    }
  }
  return null;
}

function listViolations(): {
  listed: Map<string, string>;
  violations: string[];
} {
  const violations: string[] = [];
  const listed = new Map<string, string>();
  for (const [key, reason] of Object.entries(PUBLIC_ON_PURPOSE)) {
    listed.set(key, "PUBLIC_ON_PURPOSE");
    if (reason.trim() === "") {
      violations.push(
        `${key}: PUBLIC_ON_PURPOSE needs a reason, one sentence on why it must work without a live account.`,
      );
    }
  }
  for (const key of NOT_MOVED_YET) {
    if (listed.has(key)) violations.push(`${key} is in both lists; keep one.`);
    else listed.set(key, "NOT_MOVED_YET");
  }
  const sorted = [...new Set(NOT_MOVED_YET)].sort();
  if (sorted.join("\n") !== NOT_MOVED_YET.join("\n")) {
    violations.push("NOT_MOVED_YET must be sorted with no repeats.");
  }
  return { listed, violations };
}

describe("public queries and mutations", () => {
  it("are built by authedQuery or authedMutation, or listed once", async () => {
    const found = await publicQueriesAndMutations();
    expect(found.size).toBeGreaterThan(0);

    const { listed, violations } = listViolations();
    for (const [key, fn] of found) {
      const list = listed.get(key);
      if (isAuthedFunction(fn)) {
        if (list !== undefined) {
          violations.push(
            `${key} is built by authedQuery or authedMutation; remove its ${list} entry.`,
          );
        }
      } else if (list === undefined) {
        violations.push(`${key}: ${FIX}`);
      } else if (list === "NOT_MOVED_YET") {
        const problem = await skipsHandAuth(fn);
        if (problem !== null) {
          violations.push(
            `${key} ${problem}. NOT_MOVED_YET only shrinks; ${FIX}`,
          );
        }
      }
    }
    for (const key of listed.keys()) {
      if (!found.has(key)) {
        violations.push(
          `${key} is listed but is not a public query or mutation; remove the entry.`,
        );
      }
    }

    expect(violations.sort()).toEqual([]);
  });
});
