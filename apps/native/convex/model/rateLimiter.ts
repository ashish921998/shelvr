import { DAY, HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
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
  // Bulk link import (X bookmarks). An export runs to hundreds of links, so
  // the single-save itemCreate burst of 30 would stop it almost at once. One
  // token per link actually created (duplicates are free), charged per batch
  // of up to 50. Still Pro-gated and bounded: at most 600 classifications an
  // hour through this path.
  bulkImport: { kind: "token bucket", rate: 600, period: HOUR, capacity: 600 },
  // Retrying a failed/partial save re-runs the fetch + one classification, so
  // it costs the same as a create; capped tighter since it is a manual repair.
  reprocessItem: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  // Re-classifying an edited note. updateNoteItem debounces a typing burst to
  // one run; this bounds a user who edits many notes back to back.
  noteRefresh: { kind: "token bucket", rate: 60, period: HOUR, capacity: 20 },
  // Filing an item into a space (add / accept suggestion) schedules one
  // purpose-steering classification. No page fetch, so it is cheaper than a
  // create; the burst is wider because a tidy-up session files many items in
  // a row. acceptAllSuggestions draws from this bucket without throwing.
  steerItem: { kind: "token bucket", rate: 120, period: HOUR, capacity: 40 },
  // Creating a space (or turning dynamic on) runs one recommendation pass
  // over up to 100 items: the largest single prompt we send. Onboarding
  // creates a handful of spaces back to back, so the burst covers that.
  recommendSpace: {
    kind: "token bucket",
    rate: 30,
    period: HOUR,
    capacity: 10,
  },
  // The onboarding demo's Pro-free retry of a FAILED demo classification.
  // Tighter than reprocessItem: the demo is the one uncapped-price save a
  // non-paying user gets, so retries stay strictly bounded.
  demoRetry: { kind: "token bucket", rate: 4, period: HOUR, capacity: 3 },
  // Email-keyed limit still stops one address from looping. IP and global
  // buckets stop a client from rotating emails (or one IP from flooding).
  // The global bucket gates every signup site-wide, so it must sit well
  // above a legitimate launch spike — err high.
  waitlistJoin: { kind: "token bucket", rate: 5, period: HOUR, capacity: 3 },
  waitlistJoinIp: { kind: "token bucket", rate: 20, period: HOUR, capacity: 8 },
  waitlistJoinGlobal: {
    kind: "token bucket",
    rate: 300,
    period: MINUTE,
    capacity: 100,
  },
  // In-app feedback submissions (one email to the support inbox each). The
  // row is authenticated, but unbounded submissions would still turn the
  // feedback button into a spam relay to the operator's inbox. Generous for
  // a person (3 covers an immediate follow-up burst, 6/day sustained);
  // fatal to a looped or scripted client.
  feedbackSubmit: { kind: "token bucket", rate: 6, period: DAY, capacity: 3 },
  // The no-login web oracle: one model call per verdict, open to anyone. The
  // IP bucket lets a visitor try a few modes; the global bucket caps what a
  // viral spike or an IP-rotating script can spend.
  oracleIp: { kind: "token bucket", rate: 10, period: HOUR, capacity: 4 },
  oracleGlobal: {
    kind: "token bucket",
    rate: 120,
    period: MINUTE,
    capacity: 40,
  },
});
