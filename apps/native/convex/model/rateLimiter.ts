import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

// Per-user token buckets on the mutations that each schedule real paid work
// (an LLM classification for every item create, a SerpAPI call for findLinks).
// Entitlement already gates access; these bound *spend* so a leaked/shared Pro
// account or a client retry-storm can't loop and burn money. Capacity = burst
// allowance, rate/period = sustained refill. Generous for real use, fatal to loops.
// ponytail: fixed limits; make them per-plan config if tiers ever need different caps.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  itemCreate: { kind: "token bucket", rate: 120, period: HOUR, capacity: 30 },
  findLinks: { kind: "token bucket", rate: 60, period: HOUR, capacity: 15 },
  // Retrying a failed/partial save re-runs the fetch + one classification, so
  // it costs the same as a create; capped tighter since it is a manual repair.
  reprocessItem: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
});
