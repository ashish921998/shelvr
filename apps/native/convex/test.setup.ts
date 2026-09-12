import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
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
