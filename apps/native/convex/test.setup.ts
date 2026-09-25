import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import schema from "./schema";
import { FREE_SAVE_LIMIT } from "./model/freeSaves";

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

/**
 * Marks `userId`'s free save allowance as spent, so a save without Pro is
 * refused with `pro_required` the way it was before the allowance existed.
 */
export async function spendFreeSaves(
  t: Pick<ReturnType<typeof newConvexTest>, "run">,
  userId: string,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("freeSaveUsage", {
      userId,
      used: FREE_SAVE_LIMIT,
      updatedAt: Date.now(),
    });
  });
}
