import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

// The module map lets convex-test discover and load function files.
const modules = import.meta.glob("./**/*.ts");

/**
 * Build a convex-test instance with the rate-limiter component registered.
 * Every test must go through this — mutations that call `rateLimiter.limit`
 * fail with "Component not registered" against a bare `convexTest(schema, ...)`.
 */
export function newConvexTest() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

export type TestBackend = ReturnType<typeof newConvexTest>;

/**
 * A signed-in identity backed by a real users row. `requireUserId` rejects an
 * identity whose owner row is missing or mid-deletion, so a made-up subject
 * cannot authorize anything; tests take the row's id from here and use it for
 * the data they seed. `pro` adds an active subscription, which every save and
 * Pro feature is gated on.
 */
export async function signedInUser(
  backend: TestBackend,
  options: { email?: string; pro?: boolean } = {},
): Promise<{
  userId: Id<"users">;
  t: ReturnType<TestBackend["withIdentity"]>;
}> {
  const userId = await backend.run(async (ctx) => {
    const userId = await ctx.db.insert(
      "users",
      options.email === undefined ? {} : { email: options.email },
    );
    if (options.pro === true) {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      });
    }
    return userId;
  });
  return {
    userId,
    t: backend.withIdentity({ subject: `${userId}|session-1` }),
  };
}
