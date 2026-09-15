import { type Infer, v } from "convex/values";

/**
 * Item-field validators shared by `schema.ts` (the document shape) and
 * `items.ts` (the `returns:` validators). Defining them once here is the point:
 * `items.ts` carries a comment about `capturedAt`/`intents` drifting out of its
 * hand-copied validator — these two fields must not become the next instance.
 */

// The closed set of intent kinds the model may emit and the client can run.
// Every other copy (Convex validators, the zod enum in ai.ts, the client type)
// derives from this tuple, so a new kind is added in exactly one place.
export const INTENT_KINDS = [
  "open_url",
  "copy",
  "web_search",
  "open_maps",
  "call",
  "email",
  "message",
  "add_event",
] as const;

export type IntentKind = (typeof INTENT_KINDS)[number];

// A pressable action the AI attaches to an item. `kind` is a closed set so the
// client can map each one to a guaranteed-executable handler and a valid icon;
// `label` is the button text and `value` is the payload (URL, text, number…).
export const intentKindValidator = v.union(
  ...INTENT_KINDS.map((kind) => v.literal(kind)),
);

export const intentValidator = v.object({
  kind: intentKindValidator,
  label: v.string(),
  value: v.string(),
});

// Why processing failed. `not_found` (missing page or missing/empty photo) and `image_too_large`
// are terminal; `error` is a pipeline fault worth retrying. Only set with
// `status: "failed"`.
export const failureReasonValidator = v.union(
  v.literal("not_found"),
  v.literal("error"),
  v.literal("image_too_large"),
);

// A structured recipe lifted out of a recipe page during classification
// (link items only). Absent for every other save; the client keeps rendering
// the plain article when absent. `servings` is a display string ("4 servings",
// "12 cookies") because recipes quantify the yield in too many shapes for a
// number field to be honest.
export const recipeValidator = v.object({
  name: v.optional(v.string()),
  servings: v.optional(v.string()),
  ingredients: v.array(v.string()),
  steps: v.array(v.string()),
});

export type Recipe = Infer<typeof recipeValidator>;

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

/**
 * How long an item may sit in `processing` before it is presumed orphaned.
 *
 * Convex actions are killed at 10 minutes, and the model calls in ai.ts abort
 * at 60 s (classification) or less, so a live `processItem` run can never
 * still be working at 15 minutes. Anything older either lost its action
 * (runtime kill, deploy, OOM) or its finalize/fail mutation never committed.
 * The margin above the action limit means the sweeper and `reprocessItem`
 * never fence a run that is merely slow.
 */
export const PROCESSING_STALE_MS = 15 * 60 * 1000;

/**
 * True when a `processing` item has been in flight longer than
 * `PROCESSING_STALE_MS`. Rows written before `processingStartedAt` existed
 * fall back to `_creationTime`: an item created before this field shipped has
 * exactly one run, the one its create scheduled, so creation is that run's
 * start. `now` is passed in (never read here) so queries stay pure.
 */
export function isStaleProcessing(
  item: { status: string; processingStartedAt?: number; _creationTime: number },
  now: number,
): boolean {
  if (item.status !== "processing") {
    return false;
  }
  const startedAt = item.processingStartedAt ?? item._creationTime;
  return startedAt < now - PROCESSING_STALE_MS;
}

/** Longest title a user can type for a save. The client's title field shares
 * it, so the server never has to reject what the field allowed. */
export const MAX_ITEM_TITLE_CHARS = 200;

/** Longest note text a user can save by editing. Counted in UTF-16 units, so
 * the UTF-8 bytes stay under 300 KB and the item document stays far below
 * Convex's 1 MiB limit alongside its other fields. */
export const MAX_NOTE_TEXT_CHARS = 100_000;
