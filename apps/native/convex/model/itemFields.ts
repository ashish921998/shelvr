import { v } from "convex/values";

/**
 * Item-field validators shared by `schema.ts` (the document shape) and
 * `items.ts` (the `returns:` validators). Defining them once here is the point:
 * `items.ts` carries a comment about `capturedAt`/`intents` drifting out of its
 * hand-copied validator — these two fields must not become the next instance.
 */

/** Validates the three persisted item content types. */
export const itemTypeValidator = v.union(
  v.literal("image"),
  v.literal("link"),
  v.literal("note"),
);

/** Validates the item processing lifecycle state stored on every item. */
export const itemStatusValidator = v.union(
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

/** Validates the closed set of item action intent kinds. */
export const intentKindValidator = v.union(
  v.literal("open_url"),
  v.literal("copy"),
  v.literal("web_search"),
  v.literal("open_maps"),
  v.literal("call"),
  v.literal("email"),
  v.literal("message"),
  v.literal("add_event"),
);

/** Validates one user-visible item action intent. */
export const intentValidator = v.object({
  kind: intentKindValidator,
  label: v.string(),
  value: v.string(),
});

/** Validates one product-search result attached to an item. */
export const productValidator = v.object({
  title: v.string(),
  url: v.string(),
  price: v.optional(v.string()),
  merchant: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
});

/** Validates the product-search lifecycle state for an item. */
export const productsStatusValidator = v.union(
  v.literal("searching"),
  v.literal("ready"),
  v.literal("failed"),
);

/** Validates why processing failed; `not_found` is terminal and `error` is retryable. */
export const failureReasonValidator = v.union(
  v.literal("not_found"),
  v.literal("error"),
);

/** Marks URL-only enrichment after the page body could not be read. */
export const enrichmentValidator = v.literal("partial");
