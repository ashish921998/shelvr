import { type Infer, v } from "convex/values";

/**
 * Item-field validators shared by `schema.ts` (the document shape) and
 * `items.ts` (the `returns:` validators). Defining them once here is the point:
 * `items.ts` carries a comment about `capturedAt`/`intents` drifting out of its
 * hand-copied validator — these two fields must not become the next instance.
 */

// Why processing failed. `not_found` (missing page or missing/empty photo) and `image_too_large`
// are terminal; `error` is a pipeline fault worth retrying. Only set with
// `status: "failed"`.
export const failureReasonValidator = v.union(
  v.literal("not_found"),
  v.literal("error"),
  v.literal("image_too_large"),
);

// How much of the item could be enriched. "partial" = classified from the URL
// alone because the page body was unreadable (retryable); "no_article" = the
// page loaded but no article body could be extracted (a landing page or docs
// URL, say — nothing a retry would change); absent = fully enriched.
export const enrichmentValidator = v.union(
  v.literal("partial"),
  v.literal("no_article"),
);

export function isTerminalFailure(
  reason: Infer<typeof failureReasonValidator> | undefined,
): boolean {
  return reason === "not_found" || reason === "image_too_large";
}
