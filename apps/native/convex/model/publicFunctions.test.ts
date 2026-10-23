/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { isAuthedFunction } from "./auth";
import { PUBLIC_ON_PURPOSE } from "./publicFunctions";

/** Every file Convex registers as a module: not generated, and no second dot in its name (tests, configs). */
const modules = import.meta.glob([
  "/convex/**/*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}",
  "!/convex/_generated/**",
  "!/convex/**/*.*.*",
]);

const FIX =
  "use authedQuery or authedMutation from model/auth.ts. If it must answer a signed-out or deleting caller, add it to PUBLIC_ON_PURPOSE in model/publicFunctions.ts with a reason.";

type Handler = (ctx: unknown, args: unknown) => unknown;
type Registered = {
  isPublic?: unknown;
  isQuery?: unknown;
  isMutation?: unknown;
  _handler?: Handler;
};

function isPublicQueryOrMutation(value: unknown): value is Registered {
  const fn = value as Registered | null | undefined;
  return (
    fn?.isPublic === true && (fn.isQuery === true || fn.isMutation === true)
  );
}

async function publicQueriesAndMutations(): Promise<Map<string, Registered>> {
  const found = new Map<string, Registered>();
  for (const [path, load] of Object.entries(modules)) {
    const name = path.slice("/convex/".length).replace(/\.\w+$/, "");
    const loaded = (await load()) as Record<string, unknown>;
    for (const [exported, value] of Object.entries(loaded)) {
      if (isPublicQueryOrMutation(value))
        found.set(`${name}:${exported}`, value);
    }
  }
  return found;
}

/** A ctx with only what `requireUserId` reads; any other read throws, so a handler that runs before the caller is refused fails. */
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

/** Why `fn` does not refuse both callers before anything else runs, or null when it does. */
async function refusalProblem(fn: Registered): Promise<string | null> {
  if (typeof fn._handler !== "function") return "has no handler to call";
  for (const [caller, ctx] of REFUSED_CALLERS) {
    try {
      await fn._handler(ctx, {});
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

function listViolations(found: Map<string, Registered>): string[] {
  const violations: string[] = [];
  for (const [key, reason] of Object.entries(PUBLIC_ON_PURPOSE)) {
    if (reason.trim() === "") {
      violations.push(
        `${key}: PUBLIC_ON_PURPOSE needs a reason, one sentence on why it must work without a live account.`,
      );
    }
    if (!found.has(key)) {
      violations.push(
        `${key} is listed but is not a public query or mutation; remove the entry.`,
      );
    }
  }
  return violations;
}

describe("public queries and mutations", () => {
  it("are built by authedQuery or authedMutation and refuse a caller with no live account, or are listed", async () => {
    const found = await publicQueriesAndMutations();
    expect(found.size).toBeGreaterThan(0);

    const violations = listViolations(found);
    for (const [key, fn] of found) {
      const listed = Object.hasOwn(PUBLIC_ON_PURPOSE, key);
      if (!isAuthedFunction(fn)) {
        if (!listed) violations.push(`${key}: ${FIX}`);
        continue;
      }
      if (listed) {
        violations.push(
          `${key} is built by authedQuery or authedMutation; remove its PUBLIC_ON_PURPOSE entry.`,
        );
      }
      const problem = await refusalProblem(fn);
      if (problem !== null) {
        violations.push(
          `${key} ${problem}; authedQuery and authedMutation in model/auth.ts must run requireUserId before the handler.`,
        );
      }
    }

    expect(violations.sort()).toEqual([]);
  });
});
