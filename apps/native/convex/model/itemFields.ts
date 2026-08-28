import { v } from "convex/values";

/**
 * Item-field validators shared by `schema.ts` (the document shape) and
 * `items.ts` (the `returns:` validators). Defining them once here is the point:
 * `items.ts` carries a comment about `capturedAt`/`intents` drifting out of its
 * hand-copied validator — these two fields must not become the next instance.
 */

// Why processing failed. `not_found` is terminal (the page is gone, 404/410);
// `error` is a pipeline fault worth retrying. Only set with `status: "failed"`.
export const failureReasonValidator = v.union(
  v.literal("not_found"),
  v.literal("error"),
);

// How much of the item could be enriched. "partial" = classified from the URL
// alone because the page body was unreadable; absent = fully enriched.
export const enrichmentValidator = v.literal("partial");
