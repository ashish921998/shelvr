import { ConvexError, v, type Infer } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUserId } from "./model/auth";
import {
  hasProEntitlementAt,
  hasProEntitlementStatus,
  requireProEntitlement,
} from "./subscriptions";
import { rateLimiter } from "./model/rateLimiter";
import { takeWithinBytes } from "./model/readBudget";
import {
  deleteMembership,
  deleteMembershipsForItem,
  effectiveStatus,
  getMembership,
  insertMembership,
} from "./model/memberships";
import { normalizeExternalUrl } from "./model/externalUrl";
import {
  articleMediaValidator,
  enrichmentValidator,
  failureReasonValidator,
  intentKindValidator,
  intentValidator,
  isStaleProcessing,
  isTerminalFailure,
  MAX_ITEM_TITLE_CHARS,
  MAX_NOTE_TEXT_CHARS,
  postMediaValidator,
  PROCESSING_STALE_MS,
  recipeValidator,
} from "./model/itemFields";
import {
  imageSizeError,
  imageSizeErrorCode,
  MAX_PHOTOS_PER_ACCOUNT,
} from "./model/imagePolicy";
import { saveError } from "./model/saveErrors";
import { saveSourceValidator, type SaveSource } from "./model/saveSource";
import { safeDeleteStorage } from "./model/storage";

// Re-exported for spaces.ts, which builds its membership validators from the
// same intent shape. The definitions live in model/itemFields so the schema,
// these validators, and the zod enum in ai.ts share one list of kinds.
export { intentKindValidator, intentValidator, PROCESSING_STALE_MS };

/** Practical per-query cap so a very large library can't blow the read limit. */
const LIST_CAP = 1000;

/** Most rows one `listItemsPage` page may return. The client asks for 40; the
 * cap keeps a stray argument from reading the whole library in one
 * transaction, which Convex would reject and the feed would show as an error. */
export const LIST_PAGE_MAX = 100;
/** Bytes of item documents one `listItemsPage` page may read. The page is read as
 * full documents, article bodies included, even though only the card shape is
 * returned, so a page of long articles can approach Convex's per-query read
 * limit. Past this the page comes back short and `usePaginatedQuery` splits
 * it, instead of the query failing. Half the platform limit. */
const LIST_PAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Upper bound on `listRecentItems`. The home-screen widget shows five; the
 * cap keeps a stray client argument from turning it back into a feed query. */
export const RECENT_ITEMS_MAX = 20;

const itemTypeValidator = v.union(
  v.literal("image"),
  v.literal("link"),
  v.literal("note"),
);

const itemStatusValidator = v.union(
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

// A real product result from the user-triggered "Find links" pass. Mirrors
// the schema; price stays a display string ("$1,299.00") — no math happens.
export const productValidator = v.object({
  title: v.string(),
  url: v.string(),
  price: v.optional(v.string()),
  merchant: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
});

export const productsStatusValidator = v.union(
  v.literal("searching"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("unavailable"),
);

const itemFields = {
  _id: v.id("items"),
  _creationTime: v.number(),
  userId: v.string(),
  fixtureKey: v.optional(v.string()),
  type: itemTypeValidator,
  status: itemStatusValidator,
  title: v.optional(v.string()),
  titleSource: v.optional(v.literal("user")),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  aspectRatio: v.optional(v.number()),
  capturedAt: v.optional(v.number()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  isSticker: v.optional(v.boolean()),
  tags: v.array(v.string()),
  content: v.optional(v.string()),
  recipe: v.optional(recipeValidator),
  siteName: v.optional(v.string()),
  author: v.optional(v.string()),
  heroImageUrl: v.optional(v.string()),
  media: v.optional(v.array(postMediaValidator)),
  articleMedia: v.optional(v.array(articleMediaValidator)),
  note: v.optional(v.string()),
  intents: v.optional(v.array(intentValidator)),
  products: v.optional(v.array(productValidator)),
  productsStatus: v.optional(productsStatusValidator),
  failureReason: v.optional(failureReasonValidator),
  enrichment: v.optional(enrichmentValidator),
  processingRunId: v.optional(v.string()),
  processingStartedAt: v.optional(v.number()),
  searchText: v.string(),
};

/**
 * Fields that start a new pipeline run: the item flips to `processing` under a
 * fresh run id stamped with the start time. The same id is handed to the
 * scheduled processItem action, and finalizeItem/failItem write only while it
 * still matches, so a run that is superseded (by a retry, or by the stale
 * sweeper's timestamp check) becomes a no-op instead of clobbering the newer
 * state. Every place that sets `status: "processing"` must spread this in.
 */
export function beginProcessingRun(): {
  status: "processing";
  processingRunId: string;
  processingStartedAt: number;
} {
  return {
    status: "processing",
    processingRunId: crypto.randomUUID(),
    processingStartedAt: Date.now(),
  };
}

/** What a run-fenced write did. `stale_run` means another run now owns the
 * item and the caller must treat its own result as discarded (not an error);
 * `missing` means the item was deleted while the action ran. */
const runWriteOutcomeValidator = v.union(
  v.literal("applied"),
  v.literal("stale_run"),
  v.literal("missing"),
);

// Exported so spaces.ts reuses the exact same shape — a second hand-written
// copy is how `capturedAt`/`intents` drifted out of getSpace's validator.
export const enrichedItemValidator = v.object({
  ...itemFields,
  imageUrl: v.union(v.string(), v.null()),
});

const enrichedItemWithSpacesValidator = v.object({
  ...itemFields,
  imageUrl: v.union(v.string(), v.null()),
  spaces: v.array(
    v.object({
      _id: v.id("spaces"),
      name: v.string(),
    }),
  ),
});

// The feed row. Everything a card, the masonry layout, the widget, and the
// detail pager's first paint read — and nothing that only the detail body
// shows. `content` is the extracted article (up to ai.ts's
// MAX_STORED_CONTENT_CHARS, 100k, per link) and `searchText` its index copy;
// `products` is the shopping result list.
// Shipping those with every feed push was the whole cost of the old list
// query, so consumers that need them go through `getItem`. Derived from
// `enrichedItemValidator` so a new field lands in both shapes by default and
// has to be dropped here on purpose.
export const itemCardValidator = enrichedItemValidator.omit(
  "userId",
  "content",
  "articleMedia",
  "recipe",
  "searchText",
  "products",
  "productsStatus",
);

export type ItemCard = Infer<typeof itemCardValidator>;

export async function enrichItem(ctx: QueryCtx, item: Doc<"items">) {
  const imageUrl = item.storageId
    ? await ctx.storage.getUrl(item.storageId)
    : null;
  return { ...item, imageUrl };
}

export async function toItemCard(
  ctx: QueryCtx,
  item: Doc<"items">,
): Promise<ItemCard> {
  // Destructure rather than pick so the compiler flags a field that exists on
  // the document but is missing from the validator (or vice versa).
  const {
    userId: _userId,
    content: _content,
    articleMedia: _articleMedia,
    recipe: _recipe,
    searchText: _searchText,
    products: _products,
    productsStatus: _productsStatus,
    ...card
  } = await enrichItem(ctx, item);
  return card;
}

/** How much of a note's own text the search index carries. Notes are short;
 * the cap keeps a pasted essay from bloating the index. */
const MAX_SEARCH_NOTE_CHARS = 8000;

function buildSearchText(parts: {
  title?: string;
  description?: string;
  tags: string[];
  siteName?: string;
  note?: string;
}): string {
  return [
    parts.title,
    parts.description,
    ...parts.tags,
    parts.siteName,
    parts.note?.slice(0, MAX_SEARCH_NOTE_CHARS),
  ]
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(" ")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

/** The home feed as installed builds before the paginated feed still call it:
 * every item, full rows, newest first. Public function signatures are
 * contracts with every app build in the wild, so this keeps its exact shape
 * until the production update channel shows no bundle still calling it, then
 * remove it (`LIST_CAP` stays: the image backfill uses it too). New code uses
 * `listItemsPage`. */
export const listItems = query({
  args: {},
  returns: v.array(enrichedItemValidator),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const items = await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(LIST_CAP);
    return await Promise.all(items.map((item) => enrichItem(ctx, item)));
  },
});

/** The home feed, newest first, one page at a time. Card shape only — see
 * `itemCardValidator`. The cursor fields of `paginationOpts` pass through
 * untouched so the client's reactive page splitting keeps working; the size
 * fields are bounded here so no argument can make one page read more than the
 * platform allows. */
export const listItemsPage = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(itemCardValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const opts = args.paginationOpts;
    const result = await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate({
        ...opts,
        numItems: Math.min(opts.numItems, LIST_PAGE_MAX),
        maximumBytesRead: Math.min(
          opts.maximumBytesRead ?? Infinity,
          LIST_PAGE_MAX_BYTES,
        ),
      });
    return {
      ...result,
      page: await Promise.all(result.page.map((item) => toItemCard(ctx, item))),
    };
  },
});

/** The newest `ready` saves for the Pro-only home-screen widget. The status
 * index reads exactly `limit` ready rows, so a burst of fresh imports still
 * processing can never push older ready saves out of view.
 *
 * Pro is checked without ever reading the wall clock (a query is not rerun
 * as time advances, so a Date.now() read could serve stale access). A
 * caller that sends its refreshed clock gets an exact expiry check; a
 * build that predates the `now` argument keeps its saves while the stored
 * subscription status is active, and the RevenueCat webhook lapses that
 * status when a subscription actually expires. */
export const listRecentItems = query({
  args: { limit: v.number(), now: v.optional(v.number()) },
  returns: v.array(itemCardValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const entitled =
      args.now === undefined
        ? await hasProEntitlementStatus(ctx, userId)
        : await hasProEntitlementAt(ctx, userId, args.now);
    if (!entitled) return [];
    const limit = Math.min(
      Math.max(1, Math.floor(args.limit)),
      RECENT_ITEMS_MAX,
    );
    const ready = await ctx.db
      .query("items")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "ready"),
      )
      .order("desc")
      .take(limit);
    return await Promise.all(ready.map((item) => toItemCard(ctx, item)));
  },
});

/** Every photo with a location, for the map. Only image imports carry
 * coordinates, so the scan is bounded by the photo quota rather than the whole
 * library, and the row is just what a marker needs. */
export const listLocatedItems = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("items"),
      title: v.optional(v.string()),
      latitude: v.number(),
      longitude: v.number(),
      imageUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const photos = await ctx.db
      .query("items")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", userId).eq("type", "image"),
      )
      .order("desc")
      .take(MAX_PHOTOS_PER_ACCOUNT);
    const located = photos.filter(
      (item): item is Doc<"items"> & { latitude: number; longitude: number } =>
        item.latitude !== undefined && item.longitude !== undefined,
    );
    return await Promise.all(
      located.map(async (item) => ({
        _id: item._id,
        title: item.title,
        latitude: item.latitude,
        longitude: item.longitude,
        imageUrl: item.storageId
          ? await ctx.storage.getUrl(item.storageId)
          : null,
      })),
    );
  },
});

export const getItem = query({
  args: { id: v.id("items") },
  returns: v.union(enrichedItemWithSpacesValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId) {
      return null;
    }
    const joins = await ctx.db
      .query("spaceItems")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    const spaces: { _id: Id<"spaces">; name: string }[] = [];
    for (const join of joins) {
      // Only real memberships appear as chips — suggestions and dismissals
      // are space-screen concerns, not part of the item's identity.
      if (effectiveStatus(join) !== "saved") {
        continue;
      }
      const space = await ctx.db.get(join.spaceId);
      if (space !== null) {
        spaces.push({ _id: space._id, name: space.name });
      }
    }
    const enriched = await enrichItem(ctx, item);
    return { ...enriched, spaces };
  },
});

// Search still returns full rows. Installed builds before the paginated feed
// read the article body straight off the row a detail page was opened from,
// and search is the one list they open from that lost it; a result set is
// capped at 50, so this costs what those builds always paid. Switch to
// `itemCardValidator` and `toItemCard` together with the removal of the
// legacy `listItems` above, once the production channel shows no old bundle.
// The current client accepts either shape (see DetailItem) and paints the
// body at once when the row already carries it.
export const searchItems = query({
  args: { query: v.string() },
  returns: v.array(enrichedItemValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trimmed = args.query.trim();
    if (trimmed === "") {
      return [];
    }
    const items = await ctx.db
      .query("items")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", trimmed.toLowerCase()).eq("userId", userId),
      )
      .take(50);
    return await Promise.all(items.map((item) => enrichItem(ctx, item)));
  },
});

// Similar items feed the same masonry cards as the home feed, and a tap on
// one opens the detail pager with no source list, which loads the body
// through getItem, so the card shape is enough here.
// Similar-items v0: lexical overlap, no new infra. Tags carry most of the
// signal (they're the classifier's own summary), searchText tokens catch the
// rest. A vector index over real embeddings replaces this in v1.
//
// Candidates come from two reads: the newest saves, and a full-text search on
// the item's own tags and title. The search reaches saves of any age, so an
// item saved months ago can still come back when a related one arrives.
// Both sets go through the same scoring below.
const SIMILAR_CANDIDATES = 300;
const SIMILAR_SEARCH_CANDIDATES = 100;
// Candidate rows are full documents, and an article's stored content runs to
// MAX_STORED_CONTENT_CHARS, so both reads also stop at a shared byte budget
// that leaves headroom under Convex's 16 MiB per-query read limit. The search
// runs first under its own smaller cap, so the recent read can't starve it,
// and the recent read gets whatever the search left, never less than 10 MiB.
// Each read can overshoot by the one document that crosses its cap, which
// the headroom covers.
const SIMILAR_READ_BYTES = 13 * 1024 * 1024;
const SIMILAR_SEARCH_BYTES = 3 * 1024 * 1024;
const SIMILAR_RECENT_MIN_BYTES = SIMILAR_READ_BYTES - SIMILAR_SEARCH_BYTES;
// Convex caps a full-text query at 16 terms.
const SIMILAR_SEARCH_TERMS = 16;
const SIMILAR_LIMIT = 10;
const SIMILAR_MIN_SCORE = 3;
// Mirrors RECALL_MIN_AGE_MS in apps/native/src/lib/save-recall.ts: the age a
// match needs to clear before the save recall card will show it. Reserving a
// few slots for the best-scoring matches this old means a burst of newer,
// higher-scoring saves can't crowd every old match out of SIMILAR_LIMIT
// before the card ever sees them.
const SIMILAR_OLD_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SIMILAR_RESERVED_OLD = 3;

/** The words of `text` worth matching on. Splits on Unicode letters and
 * digits, so Japanese or Korean text still yields words. Short Latin words
 * are mostly noise; words in other scripts are often two characters. */
function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(
      (word) =>
        word.length >= (/^[\p{Script=Latin}\p{N}]*$/u.test(word) ? 4 : 2),
    );
}

function searchTokens(text: string): Set<string> {
  return new Set(significantWords(text));
}

/** The full-text query for an item's older relatives: its tags first, since
 * they carry most of the scoring signal, then its title words. Deduplicated
 * and capped at the search term limit. Uses the same words as scoring, so
 * any candidate a term finds can score on it. */
function similarSearchTerms(item: Doc<"items">): string[] {
  const terms = new Set<string>();
  const words = [
    ...item.tags.flatMap(significantWords),
    ...significantWords(item.title ?? ""),
  ];
  for (const word of words) {
    terms.add(word);
    if (terms.size >= SIMILAR_SEARCH_TERMS) {
      break;
    }
  }
  return [...terms];
}

export const similarItems = query({
  args: { id: v.id("items") },
  returns: v.array(itemCardValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId || item.status !== "ready") {
      return [];
    }
    const tags = new Set(item.tags);
    const tokens = searchTokens(item.searchText);
    if (tags.size === 0 && tokens.size === 0) {
      return [];
    }

    const terms = similarSearchTerms(item);
    const searched =
      terms.length === 0
        ? { rows: [], bytes: 0 }
        : await takeWithinBytes(
            ctx.db
              .query("items")
              .withSearchIndex("search_text", (q) =>
                q.search("searchText", terms.join(" ")).eq("userId", userId),
              ),
            {
              maxRows: SIMILAR_SEARCH_CANDIDATES,
              maxBytes: SIMILAR_SEARCH_BYTES,
            },
          );

    const recent = await takeWithinBytes(
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc"),
      {
        maxRows: SIMILAR_CANDIDATES,
        maxBytes: Math.max(
          SIMILAR_READ_BYTES - searched.bytes,
          SIMILAR_RECENT_MIN_BYTES,
        ),
      },
    );

    const candidates = new Map<Id<"items">, Doc<"items">>();
    for (const candidate of [...recent.rows, ...searched.rows]) {
      candidates.set(candidate._id, candidate);
    }

    const scored: { item: Doc<"items">; score: number }[] = [];
    for (const candidate of candidates.values()) {
      if (candidate._id === item._id || candidate.status !== "ready") {
        continue;
      }
      let score = 0;
      for (const tag of candidate.tags) {
        if (tags.has(tag)) {
          score += 3;
        }
      }
      for (const token of searchTokens(candidate.searchText)) {
        if (tokens.has(token)) {
          score += 1;
        }
      }
      if (score >= SIMILAR_MIN_SCORE) {
        scored.push({ item: candidate, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);

    // Reserve a few slots for the best-scoring old-enough matches before the
    // general top-score cut, so they survive even when newer saves outscore
    // them. The final list stays score-ordered either way.
    const oldCutoff = item._creationTime - SIMILAR_OLD_AGE_MS;
    const reservedOld = scored
      .filter((candidate) => candidate.item._creationTime <= oldCutoff)
      .slice(0, SIMILAR_RESERVED_OLD);
    const reservedIds = new Set(reservedOld.map((s) => s.item._id));
    const rest = scored
      .filter((candidate) => !reservedIds.has(candidate.item._id))
      .slice(0, SIMILAR_LIMIT - reservedOld.length);
    const final = [...reservedOld, ...rest].sort((a, b) => b.score - a.score);

    return await Promise.all(
      final.map(({ item: match }) => toItemCard(ctx, match)),
    );
  },
});

// ---------------------------------------------------------------------------
// Public mutations
// ---------------------------------------------------------------------------

/**
 * Adding from inside a space files the new item there immediately — a real
 * `saved` membership, the user's own act, never subject to AI review.
 */
async function saveIntoSpace(
  ctx: MutationCtx,
  userId: string,
  itemId: Id<"items">,
  spaceId: Id<"spaces">,
): Promise<void> {
  const space = await ctx.db.get(spaceId);
  if (space === null || space.userId !== userId) {
    throw new Error("Space not found");
  }
  await insertMembership(ctx, {
    userId,
    spaceId,
    itemId,
    status: "saved",
  });
}

// ---------------------------------------------------------------------------
// Image import operation ledger
// ---------------------------------------------------------------------------
//
// Idempotent image save with a stable per-image operation ID so a retry never
// duplicates a success and never resubmits one. The client flow is:
//
//   begin  -> { uploadUrl } (or { itemId } if already finalized)
//   upload bytes to the upload URL out-of-band (outside the Convex txn)
//   attach -> records the storageId on the pending operation
//   finalize -> validates metadata and atomically inserts the item + completes
//
// Correctness goal is idempotency + compensation, NOT upload+DB atomicity: a
// process can crash after the upload succeeds but before `attach` records the
// storageId. In that gap the blob's id was never written anywhere, so nothing
// — including the stale-pending cleanup cron, which only sees storageIds
// recorded on ledger rows — can ever reclaim it. That narrow window leaks the
// blob permanently; it is documented and accepted, not eliminated.

/** Operation IDs are opaque client UUIDs (optionally prefixed for logs). This
 * bounds length so a stray empty/huge string can't pollute the index. */
const OPERATION_ID_MIN = 8;
const OPERATION_ID_MAX = 200;

function requireOperationId(operationId: string): void {
  if (
    typeof operationId !== "string" ||
    operationId.length < OPERATION_ID_MIN ||
    operationId.length > OPERATION_ID_MAX
  ) {
    throw new Error("Invalid operationId");
  }
}

/** The operation kinds the import ledger supports. Kept in one place so the
 * createLinkItem/createNoteItem operation paths stay in lockstep with the
 * schema union and the kind-checking read in loadItemOperation. */
type OperationKind = "image" | "link" | "note";

/** Loads the caller's item operation for `operationId`, or null. The (userId,
 * operationId) pair is the logical unique key — never look one up without both.
 * Callers that expect a specific `kind` must pass it so a reused operation ID
 * can't silently switch from image to link/note. */
async function loadItemOperation(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  operationId: string,
  kind: OperationKind = "image",
): Promise<Doc<"itemOperations"> | null> {
  const op = await ctx.db
    .query("itemOperations")
    .withIndex("by_user_operation", (q) =>
      q.eq("userId", userId).eq("operationId", operationId),
    )
    .unique();
  if (op === null) {
    return null;
  }
  if (op.kind !== kind) {
    throw new Error("Operation kind mismatch");
  }
  return op;
}

const STORAGE_IN_USE = "Storage object is already in use";

/** True iff neither an item nor any OTHER operation references `storageId`.
 * attach/cleanup use this to make a storage id deletable/adoptable ONLY when it
 * is a fresh, unreferenced upload (a redundant retry re-upload) — never a blob
 * an item or another in-flight operation depends on. Checking `itemOperations`
 * too closes the double-adopt hole: without it the same blob could be adopted
 * into two operations, finalize into two items sharing one blob, and then be
 * destroyed for the survivor when either item is deleted.
 *
 * KNOWN RESIDUAL (plan 003 STOP condition): this does NOT bind a storage id to
 * (userId, operationId). A blob that a client has POSTed but not yet attached
 * is referenced by nothing, so it passes here — meaning an authenticated
 * caller who somehow learns another user's still-un-attached storage id could
 * adopt or delete it within the brief upload→attach window. The direct-upload
 * API gives no server-verifiable binding to close this; exposure is limited by
 * Convex storage ids being unguessable and never surfaced to other users. A
 * true fix requires server-mediated upload completion — tracked, not done. */
async function isStorageUnreferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  excludeOperation?: Id<"itemOperations">,
): Promise<boolean> {
  const item = await ctx.db
    .query("items")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (item !== null) {
    return false;
  }
  const ops = await ctx.db
    .query("itemOperations")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .take(2);
  return ops.every((op) => op._id === excludeOperation);
}

// ponytail: counts by scanning the index (≤MAX docs per image save). Denormalize
// onto users if the cap grows past a few thousand.
async function countPhotos(ctx: QueryCtx, userId: string): Promise<number> {
  const photos = await ctx.db
    .query("items")
    .withIndex("by_user_and_type", (q) =>
      q.eq("userId", userId).eq("type", "image"),
    )
    .take(MAX_PHOTOS_PER_ACCOUNT);
  return photos.length;
}

/** Concurrent finalizes at the cap both read the same index range and one
 * inserts into it, so Convex's serializable OCC retries the loser, which then
 * sees the full count and throws. `saveError`, not Error: production redacts
 * plain Error messages to "Server Error", and this one is meant for the user. */
async function requirePhotoQuota(
  ctx: MutationCtx,
  userId: string,
): Promise<number> {
  const count = await countPhotos(ctx, userId);
  if (count >= MAX_PHOTOS_PER_ACCOUNT) {
    throw saveError("photo_limit");
  }
  return count;
}

export const photoUsage = query({
  args: {},
  returns: v.object({ count: v.number(), limit: v.number() }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return {
      count: await countPhotos(ctx, userId),
      limit: MAX_PHOTOS_PER_ACCOUNT,
    };
  },
});

/** Discriminated return for beginImageImport. A named type (rather than inline
 * object literals) keeps `kind` a literal so the `returns` validator matches. */
type BeginImageImportResult =
  | { kind: "upload"; uploadUrl: string }
  | { kind: "complete"; itemId: Id<"items"> };

/** Validates image metadata exactly as the legacy createImageItem did, so
 * finalize rejects bad input without marking the operation complete. */
function validateImageMetadata(args: {
  aspectRatio?: number;
  latitude?: number;
  longitude?: number;
}): void {
  if (
    args.aspectRatio !== undefined &&
    (!Number.isFinite(args.aspectRatio) || args.aspectRatio <= 0)
  ) {
    throw new Error("Invalid aspectRatio");
  }
  // Location is all-or-nothing: a lone latitude can't be plotted.
  const hasLocation =
    args.latitude !== undefined && args.longitude !== undefined;
  if (
    (args.latitude !== undefined || args.longitude !== undefined) &&
    (!hasLocation ||
      !Number.isFinite(args.latitude) ||
      Math.abs(args.latitude!) > 90 ||
      !Number.isFinite(args.longitude) ||
      Math.abs(args.longitude!) > 180)
  ) {
    throw new Error("Invalid location");
  }
}

export const beginImageImport = mutation({
  args: { operationId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("upload"), uploadUrl: v.string() }),
    v.object({ kind: v.literal("complete"), itemId: v.id("items") }),
  ),
  handler: async (ctx, args): Promise<BeginImageImportResult> => {
    const userId = await requireUserId(ctx);
    requireOperationId(args.operationId);
    const op = await loadItemOperation(ctx, userId, args.operationId);
    const now = Date.now();

    // Idempotent read path: a complete operation whose item still exists
    // returns the itemId WITHOUT a Pro check — a lapsed user must still
    // retrieve an already-completed save. Hoisted before the gate so every
    // path below is new or recycled work and can be gated uniformly.
    if (op?.status === "complete" && op.itemId !== undefined) {
      const item = await ctx.db.get(op.itemId);
      if (item !== null) {
        return { kind: "complete", itemId: op.itemId };
      }
    }

    // Every remaining path creates, recycles, or refreshes work — gate once.
    // Quota here saves the client an upload it could never finalize.
    await requireProEntitlement(ctx, userId);
    await requirePhotoQuota(ctx, userId);

    if (op === null) {
      // (userId, operationId) uniqueness is enforced by Convex's serializable
      // transactions: if two begins race on an empty index range, only one
      // insert commits; the other's transaction is retried and will observe
      // the row above as a pending op. No application-level unique index exists
      // because Convex has no unique secondary indexes — this OCC + retry is
      // the supported idiom.
      await ctx.db.insert("itemOperations", {
        userId,
        operationId: args.operationId,
        kind: "image",
        status: "pending",
        updatedAt: now,
      });
      return {
        kind: "upload",
        uploadUrl: await ctx.storage.generateUploadUrl(),
      };
    }

    if (op.status === "complete") {
      // Recycle: the item was deleted ( itemId set but gone) or the row is
      // inconsistent (no itemId). Release the orphaned storage object before
      // resetting, otherwise the blob leaks (the cleanup cron only sweeps
      // pending rows, and this row is currently complete). Guarded so a blob
      // some other item/operation still depends on — or one already deleted —
      // can't corrupt them or wedge this recycle path. Clearing itemId is
      // redundant for the no-itemId case but harmless.
      if (
        op.storageId !== undefined &&
        (await isStorageUnreferenced(ctx, op.storageId, op._id))
      ) {
        await safeDeleteStorage(ctx, op.storageId);
      }
      await ctx.db.patch(op._id, {
        status: "pending",
        itemId: undefined,
        storageId: undefined,
        updatedAt: now,
      });
      return {
        kind: "upload",
        uploadUrl: await ctx.storage.generateUploadUrl(),
      };
    }

    // Pending: refresh updatedAt (a begin is active interest) and hand back a
    // fresh URL. A retry that re-uploads is correct-by-design — attach keeps
    // the first storageId and discards the redundant blob. A lapsed user
    // retrying a pending op must not mint a fresh upload URL or refresh
    // updatedAt (which would keep the row alive past the cleanup cron).
    await ctx.db.patch(op._id, { updatedAt: now });
    return {
      kind: "upload",
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

export const attachImageUpload = mutation({
  args: {
    operationId: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.object({
    storageId: v.id("_storage"),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    requireOperationId(args.operationId);
    const op = await loadItemOperation(ctx, userId, args.operationId);
    const now = Date.now();

    // Skip the size check for completed ops and for a different already-attached
    // file; those paths return idempotently below.
    const validatesNewUpload =
      op?.status !== "complete" &&
      (!op?.storageId || op.storageId === args.storageId);
    const metadata = validatesNewUpload
      ? await ctx.db.system.get("_storage", args.storageId)
      : null;
    if (validatesNewUpload) {
      const error = metadata ? imageSizeError(metadata.size) : undefined;
      if (error) {
        if (!(await isStorageUnreferenced(ctx, args.storageId, op?._id))) {
          throw new Error(STORAGE_IN_USE);
        }
        await safeDeleteStorage(ctx, args.storageId);
        if (op) {
          await ctx.db.patch(op._id, { storageId: undefined, updatedAt: now });
        }
        // Return, don't throw: throwing would roll back storage cleanup.
        return { storageId: args.storageId, error };
      }
    }

    if (op === null) {
      // No begin happened (or the row was swept). Adopt the caller's storage id
      // only if the blob actually exists (a swept id must not become an item
      // with a permanently dead image) and isn't referenced by an item or
      // another operation. NOTE: existence + unreferenced is NOT proof the
      // caller owns this blob during the un-attached window — see the residual
      // documented on isStorageUnreferenced.
      if (metadata === null) {
        throw new Error("Storage object not found");
      }
      if (!(await isStorageUnreferenced(ctx, args.storageId))) {
        throw new Error(STORAGE_IN_USE);
      }
      await ctx.db.insert("itemOperations", {
        userId,
        operationId: args.operationId,
        kind: "image",
        status: "pending",
        storageId: args.storageId,
        updatedAt: now,
      });
      return { storageId: args.storageId };
    }

    if (op.status === "complete") {
      // Already finalized (a racing retry lost to the original's finalize).
      // Return the canonical id, and delete the retry's redundant re-upload —
      // otherwise it is referenced by nothing (no item, no ledger row) and the
      // pending-only cleanup cron would never reclaim it. The unreferenced
      // guard keeps a blob some other item/operation owns safe.
      if (
        args.storageId !== op.storageId &&
        (await isStorageUnreferenced(ctx, args.storageId))
      ) {
        await safeDeleteStorage(ctx, args.storageId);
      }
      return { storageId: op.storageId ?? args.storageId };
    }

    // First attachment wins. A racing retry that supplies a different storageId
    // has re-uploaded redundantly; delete the REDUNDANT (incoming) blob — but
    // only if it is unreferenced, so a client can never delete storage it
    // doesn't own (e.g. another user's blob or another operation's pending
    // upload).
    if (op.storageId !== undefined && op.storageId !== args.storageId) {
      if (await isStorageUnreferenced(ctx, args.storageId)) {
        await safeDeleteStorage(ctx, args.storageId);
      }
      await ctx.db.patch(op._id, { updatedAt: now });
      return { storageId: op.storageId };
    }
    // No canonical id yet, or the caller re-sent the same id: adopt it, with
    // the same existence and unreferenced defenses as the no-begin path.
    if (op.storageId === undefined) {
      if (metadata === null) {
        throw new Error("Storage object not found");
      }
      if (!(await isStorageUnreferenced(ctx, args.storageId))) {
        throw new Error(STORAGE_IN_USE);
      }
    }
    await ctx.db.patch(op._id, { storageId: args.storageId, updatedAt: now });
    return { storageId: args.storageId };
  },
});

export const finalizeImageImport = mutation({
  args: {
    operationId: v.string(),
    analyticsSessionId: v.optional(v.string()),
    saveSource: v.optional(saveSourceValidator),
    aspectRatio: v.optional(v.number()),
    isSticker: v.optional(v.boolean()),
    capturedAt: v.optional(v.number()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    spaceId: v.optional(v.id("spaces")),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    requireOperationId(args.operationId);

    const op = await loadItemOperation(ctx, userId, args.operationId);

    // Already complete — return the original live item id WITHOUT validating
    // the resubmitted metadata. The idempotent read path must not be gated on
    // the caller resending identical valid fields; a completed import is final.
    // (A complete row pointing at a deleted item should have been recycled by
    // begin; if we reach here, treat it as complete with the recorded id.)
    // Entitlement is NOT checked here — a lapsed user must still retrieve an
    // already-completed itemId.
    if (op !== null && op.status === "complete" && op.itemId !== undefined) {
      return op.itemId;
    }

    // Gate only new work (creating an item from a pending operation). Rate limit
    // sits here too — after the idempotent completed-return above, so a retry of
    // an already-finished import is never charged against the bucket.
    await requireProEntitlement(ctx, userId);
    const photoCount = await requirePhotoQuota(ctx, userId);
    let storedBytes: number | undefined;
    if (op?.storageId) {
      const metadata = await ctx.db.system.get("_storage", op.storageId);
      if (!metadata) throw new Error("Storage object not found");
      const sizeCode = imageSizeErrorCode(metadata.size);
      if (sizeCode) throw saveError(sizeCode);
      storedBytes = metadata.size;
    }
    await rateLimiter.limit(ctx, "itemCreate", { key: userId, throws: true });

    // Validate BEFORE touching the ledger: invalid metadata must not mark the
    // operation complete, so the caller can retry with corrected input.
    validateImageMetadata(args);

    if (op === null) {
      // The caller skipped begin (or the row was swept). We have no storageId
      // to attach, so this is an invalid import attempt.
      throw new Error("Operation has no attached upload");
    }
    if (op.storageId === undefined) {
      // begin succeeded but attach never ran (process died between upload and
      // attach). The narrow unreferenced-blob window the plan documents.
      throw new Error("Operation has no attached upload");
    }

    const run = beginProcessingRun();
    const itemId = await ctx.db.insert("items", {
      userId,
      type: "image",
      ...run,
      storageId: op.storageId,
      aspectRatio: args.aspectRatio,
      isSticker: args.isSticker,
      capturedAt: args.capturedAt,
      latitude: args.latitude,
      longitude: args.longitude,
      tags: [],
      searchText: "",
    });
    if (args.spaceId !== undefined) {
      await saveIntoSpace(ctx, userId, itemId, args.spaceId);
    }
    await ctx.db.patch(op._id, {
      status: "complete",
      itemId,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.ai.processItem, {
      itemId,
      runId: run.processingRunId,
    });
    await scheduleSaveTelemetry(ctx, itemId, {
      sessionId: args.analyticsSessionId,
      saveSource: args.saveSource,
      photoCount: photoCount + 1,
      storedBytes,
    });
    return itemId;
  },
});

/** Read-only probe of an operation's server-side state. Used by client recovery
 * (e.g. plan 005's Tidy undo) to learn whether an operation completed. It MUST
 * NOT create, refresh, or patch a row and must not touch updatedAt — probing on
 * every launch through begin would create pending rows whose only exit is the
 * 24h cleanup and refresh their updatedAt, deferring cleanup indefinitely. */
export const getImportOperation = query({
  args: { operationId: v.string() },
  returns: v.union(
    v.object({
      status: v.union(v.literal("pending"), v.literal("complete")),
      itemId: v.optional(v.id("items")),
      storageId: v.optional(v.id("_storage")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    // Deliberately kind-agnostic: this probe serves every operation kind
    // (plans 004/005 add link/note), so it must not throw a kind mismatch the
    // way the image mutations do.
    const op = await ctx.db
      .query("itemOperations")
      .withIndex("by_user_operation", (q) =>
        q.eq("userId", userId).eq("operationId", args.operationId),
      )
      .unique();
    if (op === null) {
      return null;
    }
    return {
      status: op.status,
      itemId: op.itemId,
      storageId: op.storageId,
    };
  },
});

/** Pending operations untouched for longer than this are considered abandoned
 * and eligible for the cleanup sweep. Tests derive staleness from this. */
export const STALE_IMPORT_CUTOFF_MS = 24 * 60 * 60 * 1000;

/** Sweep a bounded page of pending image operations older than the cutoff:
 * delete the unreferenced attached upload (the blob the process never
 * finalized), then the ledger row. Complete rows stay as the permanent
 * idempotency record. The index leads with kind so stale link/note rows
 * (plans 004/005) can never fill the page and starve image cleanup. */
/** Rows swept per transaction. A full page chains a follow-up run, so backlog
 * drains at scheduler speed instead of one page per cron interval. */
const CLEANUP_PAGE_SIZE = 100;

export const cleanupStaleImageImports = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const cutoff = Date.now() - STALE_IMPORT_CUTOFF_MS;
    const stale = await ctx.db
      .query("itemOperations")
      .withIndex("by_kind_status_updated", (q) =>
        q.eq("kind", "image").eq("status", "pending").lt("updatedAt", cutoff),
      )
      .take(CLEANUP_PAGE_SIZE);
    for (const op of stale) {
      // Guarded delete: a pending row's blob is normally referenced by nothing
      // else, but if it ever is (item or sibling operation), deleting it would
      // destroy a live image — drop only the ledger row in that case. And a
      // blob already gone must not throw and wedge the sweep (this mutation is
      // transactional and re-reads the same oldest page every run).
      if (
        op.storageId !== undefined &&
        (await isStorageUnreferenced(ctx, op.storageId, op._id))
      ) {
        await safeDeleteStorage(ctx, op.storageId);
      }
      await ctx.db.delete(op._id);
    }
    // A full page means more stale rows likely remain; sweep again immediately
    // rather than waiting for the next cron tick.
    if (stale.length === CLEANUP_PAGE_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.items.cleanupStaleImageImports,
        {},
      );
    }
    return null;
  },
});

/**
 * Idempotent completion for a link/note operation. When a durable `operationId`
 * is supplied, (userId, operationId) is the unique key: a repeat with the same
 * id returns the previously created item; a kind mismatch rejects; otherwise the
 * item insert, optional space membership, operation completion, and scheduler
 * job all land in this one transaction so a crash mid-mutation never leaves a
 * completed item without its ledger row (or vice versa). Calls without an
 * operationId skip the ledger entirely and always create a fresh item — the
 * ordinary Add UI path.
 */
async function createItemWithOperation(
  ctx: MutationCtx,
  userId: string,
  kind: Extract<OperationKind, "link" | "note">,
  payload: { url: string } | { note: string },
  options: {
    operationId?: string;
    spaceId?: Id<"spaces">;
    analyticsSessionId?: string;
    saveSource?: SaveSource;
  },
): Promise<Id<"items">> {
  const now = Date.now();

  // Validate BEFORE consulting the ledger so a retry with corrected input is
  // never short-circuited by an idempotent read, and an invalid input never
  // creates a half-completed operation.
  validateLinkOrNotePayload(kind, payload);

  // Operation-guarded path (durable share operations). Reads & writes happen in
  // the same mutation transaction, so a retry that races itself resolves to one
  // item via Convex's serializable OCC — no application-level unique index.
  if (options.operationId !== undefined) {
    requireOperationId(options.operationId);
    const op = await loadItemOperation(ctx, userId, options.operationId, kind);
    if (op !== null) {
      // A recycled operation whose item was deleted (by deleteItem, which
      // releases the row) shows up as null above. A complete row pointing at a
      // live item is the idempotent hit; a complete row with no item, or a
      // pending row, is inconsistent for the single-shot link/note path (which
      // has no upload/attach stages), so we treat it as recyclable: clear it
      // and fall through to create. Defensive, mirrors beginImageImport.
      if (op.status === "complete" && op.itemId !== undefined) {
        const item = await ctx.db.get(op.itemId);
        if (item !== null) {
          return op.itemId;
        }
      }
      // Stale/inconsistent: recycle the row in place for the fresh create below.
      await ctx.db.patch(op._id, { status: "pending", itemId: undefined });
    }

    // New work is now certain (the idempotent completed-return above already
    // exited). Charge the itemCreate bucket HERE, not in the mutation handler,
    // so a retry of an already-finished operation is never billed a token —
    // mirrors finalizeImageImport's rate-limit-after-idempotency ordering.
    await rateLimiter.limit(ctx, "itemCreate", { key: userId, throws: true });
    const itemId = await insertLinkOrNote(ctx, userId, kind, payload, options);
    if (op === null) {
      await ctx.db.insert("itemOperations", {
        userId,
        operationId: options.operationId,
        kind,
        status: "complete",
        itemId,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(op._id, {
        status: "complete",
        itemId,
        updatedAt: now,
      });
    }
    // processItem is scheduled exactly once per create — inside
    // insertLinkOrNote above. Do NOT schedule it again here: a second schedule
    // would run the AI pipeline twice on the same item, wasting cost and racing
    // two concurrent classifications against each other.
    return itemId;
  }

  // Ordinary (non-idempotent) path: one item per call, no ledger row.
  await rateLimiter.limit(ctx, "itemCreate", { key: userId, throws: true });
  return await insertLinkOrNote(ctx, userId, kind, payload, options);
}

/** Throws if a link/note payload is empty/invalid. Validation is shared by the
 * operation-guarded and ordinary paths so both reject bad input identically.
 * Link URLs are fully normalized by `createLinkItem` before this runs; the
 * non-empty check here is defense-in-depth for direct callers. */
function validateLinkOrNotePayload(
  kind: Extract<OperationKind, "link" | "note">,
  payload: { url: string } | { note: string },
): void {
  if (kind === "link") {
    if (
      !("url" in payload) ||
      typeof payload.url !== "string" ||
      payload.url === ""
    ) {
      throw new Error("Invalid URL");
    }
    return;
  }
  if (!("note" in payload) || payload.note.trim() === "") {
    throw new Error("Note text is empty");
  }
}

/** Inserts a link or note item, files it into the optional space, and schedules
 * AI processing. The kind/payload pairing is discriminated so the compiler
 * narrows without a cast. Shared by both createItemWithOperation code paths. */
async function insertLinkOrNote(
  ctx: MutationCtx,
  userId: string,
  kind: Extract<OperationKind, "link" | "note">,
  payload: { url: string } | { note: string },
  options: {
    spaceId?: Id<"spaces">;
    analyticsSessionId?: string;
    saveSource?: SaveSource;
  },
): Promise<Id<"items">> {
  const run = beginProcessingRun();
  const itemId = await ctx.db.insert("items", {
    userId,
    type: kind,
    ...run,
    ...(kind === "link" && "url" in payload ? { url: payload.url } : {}),
    ...(kind === "note" && "note" in payload ? { note: payload.note } : {}),
    tags: [],
    searchText: "",
  });
  if (options.spaceId !== undefined) {
    await saveIntoSpace(ctx, userId, itemId, options.spaceId);
  }
  await ctx.scheduler.runAfter(0, internal.ai.processItem, {
    itemId,
    runId: run.processingRunId,
  });
  await scheduleSaveTelemetry(ctx, itemId, {
    sessionId: options.analyticsSessionId,
    saveSource: options.saveSource,
  });
  return itemId;
}

async function scheduleSaveTelemetry(
  ctx: MutationCtx,
  itemId: Id<"items">,
  telemetry?: {
    sessionId?: string;
    saveSource?: SaveSource;
    photoCount?: number;
    storedBytes?: number;
  },
): Promise<void> {
  const item = await ctx.db.get(itemId);
  if (!item) return;
  await ctx.scheduler.runAfter(0, internal.analytics.captureSave, {
    itemId,
    userId: item.userId,
    itemType: item.type,
    savedAt: item._creationTime,
    ...telemetry,
    sessionId: telemetry?.sessionId?.slice(0, 128),
  });
}

export const createLinkItem = mutation({
  args: {
    url: v.string(),
    spaceId: v.optional(v.id("spaces")),
    operationId: v.optional(v.string()),
    analyticsSessionId: v.optional(v.string()),
    saveSource: v.optional(saveSourceValidator),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    // Rate limiting is charged inside createItemWithOperation, after the
    // idempotent completed-operation return, so a retry of a finished share
    // isn't billed a token.
    // Centralized syntactic URL policy: rejects non-http(s) schemes, embedded
    // credentials, non-default ports, missing hosts, and oversized URLs before
    // the item is ever inserted or scheduled. Network-destination safety (private
    // IP ranges, DNS answers) is enforced later, bound to the actual connection,
    // by the safe fetcher in convex/model/safeFetch.ts.
    const url = normalizeExternalUrl(args.url);
    return await createItemWithOperation(
      ctx,
      userId,
      "link",
      { url },
      {
        operationId: args.operationId,
        spaceId: args.spaceId,
        analyticsSessionId: args.analyticsSessionId,
        saveSource: args.saveSource,
      },
    );
  },
});

export const createNoteItem = mutation({
  args: {
    text: v.string(),
    spaceId: v.optional(v.id("spaces")),
    operationId: v.optional(v.string()),
    analyticsSessionId: v.optional(v.string()),
    saveSource: v.optional(saveSourceValidator),
  },
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    // Rate limiting is charged inside createItemWithOperation, after the
    // idempotent completed-operation return (see createLinkItem).
    return await createItemWithOperation(
      ctx,
      userId,
      "note",
      { note: args.text },
      {
        operationId: args.operationId,
        spaceId: args.spaceId,
        analyticsSessionId: args.analyticsSessionId,
        // Defaulted server-side so a client that sends nothing still reports
        // `note`, while share.tsx can override with `share_extension`: a note
        // shared through the extension is extension use, and counting it as an
        // ordinary note would understate the extension's adoption.
        saveSource: args.saveSource ?? "note",
      },
    );
  },
});

// ---------------------------------------------------------------------------
// Bulk link import (X bookmarks)
// ---------------------------------------------------------------------------

/** Most URLs one importLinks call accepts. Each created link is one insert and
 * two scheduled functions, so a batch stays well inside a transaction; the
 * client pages through longer lists. */
const MAX_IMPORT_BATCH = 50;

/** Gap between successive processItem runs of one import, so hundreds of page
 * fetches and classifications do not start at once. */
export const IMPORT_STAGGER_MS = 1000;

/** Cap on the client-supplied stagger offset. The bulkImport bucket holds 600
 * tokens, so an honest import never passes this; a larger value would only
 * push processing further into the future. */
const MAX_IMPORT_STAGGER_OFFSET = 1000;

const importLinksResultValidator = v.object({
  created: v.number(),
  // Already saved, or repeated earlier in this batch.
  skipped: v.number(),
  // Not a URL the save policy accepts.
  invalid: v.number(),
  // New, valid links left uncreated because the bulkImport bucket was empty.
  notProcessed: v.number(),
  rateLimited: v.boolean(),
});

/** Whether the user already saved this link. Every link save stores the
 * normalized URL, so the index lookup is exact and finds a save of any age. */
async function hasSavedLink(
  ctx: QueryCtx,
  userId: string,
  url: string,
): Promise<boolean> {
  const match = await ctx.db
    .query("items")
    .withIndex("by_user_and_url", (q) => q.eq("userId", userId).eq("url", url))
    .first();
  return match !== null;
}

/**
 * Bulk-import link URLs, such as X bookmarks. Each new link goes through the
 * same pipeline as a single save. Links already saved and repeats within the
 * batch are skipped for free, so pasting the same list again resumes an
 * import that stopped at the rate limit.
 *
 * The batch draws one `bulkImport` token per link it would create, all or
 * nothing. When the bucket cannot cover the batch, nothing is created and
 * `rateLimited` tells the client to stop paging.
 */
export const importLinks = mutation({
  args: {
    urls: v.array(v.string()),
    // Links earlier calls of this import created, so the processing stagger
    // continues across batches instead of restarting at zero.
    staggerOffset: v.optional(v.number()),
  },
  returns: importLinksResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    if (args.urls.length > MAX_IMPORT_BATCH) {
      throw new ConvexError(
        `Import accepts at most ${MAX_IMPORT_BATCH} URLs per call`,
      );
    }

    let skipped = 0;
    let invalid = 0;
    const fresh: string[] = [];
    for (const raw of args.urls) {
      const trimmed = raw.trim();
      if (trimmed === "") continue;
      let url: string;
      try {
        url = normalizeExternalUrl(trimmed);
      } catch {
        invalid++;
        continue;
      }
      if (fresh.includes(url) || (await hasSavedLink(ctx, userId, url))) {
        skipped++;
        continue;
      }
      fresh.push(url);
    }
    if (fresh.length === 0) {
      return {
        created: 0,
        skipped,
        invalid,
        notProcessed: 0,
        rateLimited: false,
      };
    }

    const { ok } = await rateLimiter.limit(ctx, "bulkImport", {
      key: userId,
      count: fresh.length,
    });
    if (!ok) {
      return {
        created: 0,
        skipped,
        invalid,
        notProcessed: fresh.length,
        rateLimited: true,
      };
    }

    const offset = Number.isFinite(args.staggerOffset)
      ? Math.min(
          Math.max(Math.floor(args.staggerOffset ?? 0), 0),
          MAX_IMPORT_STAGGER_OFFSET,
        )
      : 0;
    for (const [index, url] of fresh.entries()) {
      const run = beginProcessingRun();
      const itemId = await ctx.db.insert("items", {
        userId,
        type: "link",
        ...run,
        url,
        tags: [],
        searchText: "",
      });
      await ctx.scheduler.runAfter(
        (offset + index) * IMPORT_STAGGER_MS,
        internal.ai.processItem,
        { itemId, runId: run.processingRunId },
      );
      // No saveSource: the closed union has no literal for a bulk import, and
      // a wrong one would pollute the funnel worse than an absent one does.
      await scheduleSaveTelemetry(ctx, itemId);
    }
    return {
      created: fresh.length,
      skipped,
      invalid,
      notProcessed: 0,
      rateLimited: false,
    };
  },
});

/** Delay before an edited note is re-classified. Each edit in the window
 * supersedes the scheduled run, so a burst of typing costs one model call. */
export const NOTE_REFRESH_DELAY_MS = 20_000;

/**
 * The owner edits a note's text and title. A typed title replaces the
 * classifier's and survives later classification; an empty title hands naming
 * back to the classifier. A text change on a ready note re-classifies it
 * quietly after NOTE_REFRESH_DELAY_MS, so search and space suggestions follow
 * the new words without the note ever showing as processing. The refresh keeps
 * the title the note already has, so only an untitled note is renamed.
 */
export const updateNoteItem = mutation({
  args: {
    id: v.id("items"),
    // Older clients send both fields. New editors send only what was edited.
    title: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId || item.type !== "note") {
      throw new Error("Item not found");
    }
    const text = args.text ?? item.note ?? "";
    if (text.trim() === "") {
      throw new Error("Note text is empty");
    }
    if (text.length > MAX_NOTE_TEXT_CHARS) {
      throw new Error("Note text is too long");
    }
    const currentTypedTitle =
      item.titleSource === "user" ? item.title : undefined;
    const typedTitle = args.title?.trim() ?? currentTypedTitle ?? "";
    if (typedTitle.length > MAX_ITEM_TITLE_CHARS) {
      throw new Error("Title is too long");
    }
    const textChanged = text !== item.note;
    const titleChanged = (typedTitle || undefined) !== currentTypedTitle;
    if (!textChanged && !titleChanged) {
      return null;
    }
    // Clearing a typed title leaves the note untitled until the classifier
    // names it again; a classifier title stays until the user types one.
    const title =
      typedTitle !== ""
        ? typedTitle
        : item.titleSource === "user"
          ? undefined
          : item.title;
    // A processing note must supersede its snapshot too. Its replacement
    // completes initial classification; ready notes refresh quietly.
    const refreshRunId =
      (textChanged || (titleChanged && typedTitle === "")) &&
      item.status !== "failed"
        ? crypto.randomUUID()
        : undefined;
    await ctx.db.patch(item._id, {
      note: text,
      title,
      titleSource: typedTitle !== "" ? "user" : undefined,
      searchText: buildSearchText({
        title,
        description: item.description,
        tags: item.tags,
        note: text,
      }),
      ...(refreshRunId !== undefined ? { processingRunId: refreshRunId } : {}),
      ...(refreshRunId !== undefined && item.status === "processing"
        ? { processingStartedAt: Date.now() }
        : {}),
    });
    if (refreshRunId !== undefined) {
      await ctx.scheduler.runAfter(
        NOTE_REFRESH_DELAY_MS,
        internal.ai.processItem,
        {
          itemId: item._id,
          runId: refreshRunId,
          refresh: item.status === "ready",
        },
      );
    }
    return null;
  },
});

/**
 * User-triggered product search ("Find links"). Explicit button = bounded
 * cost: one vision/text query + one SerpAPI call per press, never automatic.
 */
export const findLinks = mutation({
  args: { id: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    if (
      item.status !== "ready" ||
      item.productsStatus === "searching" ||
      item.productsStatus === "unavailable"
    ) {
      return null;
    }
    if (item.type === "image") {
      const metadata = item.storageId
        ? await ctx.db.system.get("_storage", item.storageId)
        : null;
      if (!metadata || imageSizeError(metadata.size)) {
        await ctx.db.patch(item._id, { productsStatus: "unavailable" });
        return null;
      }
    }
    await rateLimiter.limit(ctx, "findLinks", { key: userId, throws: true });
    await ctx.db.patch(item._id, { productsStatus: "searching" });
    await ctx.scheduler.runAfter(0, internal.ai.findProductLinks, {
      itemId: item._id,
    });
    return null;
  },
});

/**
 * User-triggered retry for a save whose page fetch or classification did not
 * fully succeed: a `failed` item, a `ready` one flagged `enrichment: "partial"`
 * (classified from its URL because the page body was unreadable), or a
 * `processing` one whose run is older than PROCESSING_STALE_MS (its action is
 * dead — see the constant's rationale — and the sweeper has not reached it
 * yet). Re-runs the same pipeline, so it is rate-limited like a create.
 *
 * A fresh `processing` item is refused: its action may still finish, and
 * minting a second run would only waste a model call. A stale one gets a new
 * run id, which fences the old run's finalize/fail should it somehow land.
 *
 * Unavailable sources and oversized photos are terminal; retrying would
 * spend classification capacity without changing the result.
 */
export const reprocessItem = mutation({
  args: { id: v.id("items") },
  // True when a new run was scheduled. False means the item is not retryable
  // as the server sees it, which the client can only guess at: its stale check
  // runs on the device clock, so a fast clock offers a retry the server still
  // considers in flight. The client uses this to say so instead of going quiet.
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    const retryable =
      (item.status === "failed" && !isTerminalFailure(item.failureReason)) ||
      (item.status === "ready" && item.enrichment === "partial") ||
      isStaleProcessing(item, Date.now());
    if (!retryable) {
      return false;
    }
    await rateLimiter.limit(ctx, "reprocessItem", {
      key: userId,
      throws: true,
    });
    const run = beginProcessingRun();
    await ctx.db.patch(args.id, {
      ...run,
      failureReason: undefined,
      // Dropped up front so an in-flight retry — and a retry that fails again —
      // never carries the previous run's "partial" marker.
      enrichment: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.ai.processItem, {
      itemId: args.id,
      runId: run.processingRunId,
    });
    return true;
  },
});

export const deleteItem = mutation({
  args: { id: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    // Drops the item from every space and fixes each space's counts/covers.
    await deleteMembershipsForItem(ctx, item._id);
    // Release the import operation(s) that produced this item so a durable
    // operationId can be re-performed after an explicit delete (Tidy undo).
    // Pending rows have no itemId and are excluded by the index; this only
    // touches completed operations whose result was this item. AI processing
    // failures do NOT release the operation — the item still exists.
    const operations = await ctx.db
      .query("itemOperations")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    for (const op of operations) {
      await ctx.db.delete(op._id);
    }
    const reads = await ctx.db
      .query("itemReads")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    for (const read of reads) {
      await ctx.db.delete(read._id);
    }
    const shareLinks = await ctx.db
      .query("shareLinks")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    for (const link of shareLinks) {
      await ctx.db.delete(link._id);
    }
    if (item.storageId) {
      // Existence-checked: if the blob is somehow already gone, the delete must
      // still remove the item rather than throw and leave it undeletable.
      await safeDeleteStorage(ctx, item.storageId);
    }
    await ctx.db.delete(item._id);
    return null;
  },
});

/** Token for an item's public preview page, minted the first time the owner
 * shares it and reused after. Null when the item has no preview to show (not
 * ready, or an image, which shares its file instead). */
export const createShareLink = mutation({
  args: { itemId: v.id("items") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    if (!isShareable(item)) return null;

    const existing = await ctx.db
      .query("shareLinks")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .first();
    if (existing !== null) return existing.token;

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await ctx.db.insert("shareLinks", { token, userId, itemId: item._id });
    return token;
  },
});

function isShareable(item: Doc<"items">): boolean {
  return item.status === "ready" && item.type !== "image";
}

// ---------------------------------------------------------------------------
// Internal — used by the AI actions
// ---------------------------------------------------------------------------

export const getItemInternal = internalQuery({
  args: { itemId: v.id("items") },
  returns: v.union(v.object(itemFields), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.itemId);
  },
});

/** Bounded preview for the public branded share page, looked up by the token
 * `createShareLink` minted. Deliberately narrow: no `userId`, no article
 * body, no tags — just enough to render an OG card and a landing page for
 * someone who doesn't have the app yet. */
export const getSharePreview = internalQuery({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      type: itemTypeValidator,
      title: v.string(),
      description: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
      noteText: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { token }) => {
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (link === null) return null;
    const item = await ctx.db.get(link.itemId);
    if (!item || item.userId !== link.userId || !isShareable(item)) return null;

    const { imageUrl } = await enrichItem(ctx, item);
    return {
      type: item.type,
      title: item.title ?? "A save from Shelvr",
      description: item.description,
      imageUrl: imageUrl ?? item.heroImageUrl,
      sourceUrl: item.type === "link" ? item.url : undefined,
      noteText: item.type === "note" ? item.note?.slice(0, 500) : undefined,
    };
  },
});

export const listReadyItemsInternal = internalQuery({
  args: { userId: v.string(), limit: v.number() },
  returns: v.array(v.object(itemFields)),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, Math.floor(args.limit)), 200);
    // Index-scoped to `ready` so a library full of failed or in-flight saves
    // still yields `limit` candidates; the old by_user read took 2x and
    // filtered in JS, which starved users with many failed items.
    return await ctx.db
      .query("items")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "ready"),
      )
      .order("desc")
      .take(limit);
  },
});

/**
 * Run fencing for the two writes that end a pipeline run. The run that owns
 * the item is whichever one most recently flipped it to `processing`; a
 * caller whose `runId` differs was superseded (a retry, or a stale-sweep
 * followed by a retry) and must not touch the row. Both sides absent counts
 * as a match so a job scheduled before fencing shipped can still finish the
 * pre-fencing item it was scheduled for.
 */
function ownsRun(item: Doc<"items">, runId: string | undefined): boolean {
  return item.processingRunId === runId;
}

/**
 * Gate for an edited note's quiet refresh (see updateNoteItem). Only the run
 * the latest edit scheduled goes on to call the model, and it draws from the
 * noteRefresh bucket without throwing: a refused refresh leaves the note as
 * it is.
 */
export const claimNoteRefresh = internalMutation({
  args: { itemId: v.id("items"), runId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (
      item === null ||
      item.type !== "note" ||
      item.status !== "ready" ||
      !ownsRun(item, args.runId)
    ) {
      return false;
    }
    const { ok } = await rateLimiter.limit(ctx, "noteRefresh", {
      key: item.userId,
    });
    return ok;
  },
});

export const finalizeItem = internalMutation({
  args: {
    itemId: v.id("items"),
    // The run id processItem was scheduled with. Optional only so actions
    // queued before this argument existed still validate; every new schedule
    // passes it.
    runId: v.optional(v.string()),
    title: v.string(),
    // An edited note's quiet refresh: a title the note already has stays, so
    // re-classifying new words doesn't rename the note on every edit. A note
    // with no title (its typed title was just cleared) still takes this one.
    keepTitle: v.optional(v.boolean()),
    description: v.string(),
    tags: v.array(v.string()),
    content: v.optional(v.string()),
    recipe: v.optional(recipeValidator),
    siteName: v.optional(v.string()),
    author: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    media: v.optional(v.array(postMediaValidator)),
    articleMedia: v.optional(v.array(articleMediaValidator)),
    // A poster copied into our storage (TikTok thumbnails expire). Only ever
    // set for links; image items keep the storageId they were uploaded with.
    storageId: v.optional(v.id("_storage")),
    aspectRatio: v.optional(v.number()),
    intents: v.optional(v.array(intentValidator)),
    status: itemStatusValidator,
    enrichment: v.optional(enrichmentValidator),
  },
  returns: runWriteOutcomeValidator,
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null) {
      return "missing";
    }
    // Race: the user pressed retry while this run was still awaiting the
    // model. The retry owns the item now; writing here would overwrite its
    // result with ours (or flip a newer `processing` back to `ready` with
    // stale content). Status is deliberately NOT checked: a run the sweeper
    // failed by timestamp still owns the row, so if it does finish it may
    // repair the item — a late success beats a presumed failure.
    if (!ownsRun(item, args.runId)) {
      return "stale_run";
    }
    // Intents are actions, not descriptive text — deliberately kept out of
    // searchText so labels like "Open in X" don't skew search relevance.
    // A title the owner typed outranks the classifier's, and so does the one a
    // refreshed note already has; the rest of the classification still lands.
    const title =
      (item.titleSource === "user" || args.keepTitle === true) &&
      item.title !== undefined
        ? item.title
        : args.title;
    const searchText = buildSearchText({
      title,
      description: args.description,
      tags: args.tags,
      siteName: args.siteName,
      note: item.note,
    });
    await ctx.db.patch(args.itemId, {
      title,
      description: args.description,
      tags: args.tags,
      content: args.content,
      recipe: args.recipe,
      siteName: args.siteName,
      author: args.author,
      heroImageUrl: args.heroImageUrl,
      media: args.media,
      articleMedia: args.articleMedia,
      ...(args.storageId !== undefined ? { storageId: args.storageId } : {}),
      aspectRatio: args.aspectRatio,
      intents: args.intents,
      status: args.status,
      // Always written so a successful retry clears a previous "partial" flag
      // and a previous failureReason (patching undefined removes the field).
      enrichment: args.enrichment,
      failureReason: undefined,
      searchText,
    });
    if (
      args.storageId !== undefined &&
      item.storageId !== undefined &&
      item.storageId !== args.storageId &&
      (await isStorageUnreferenced(ctx, item.storageId))
    ) {
      await safeDeleteStorage(ctx, item.storageId);
    }
    return "applied";
  },
});

/** Best-effort compensation for a poster stored by an action before the item
 * could be finalized. Rechecking the reference index makes this safe when a
 * mutation committed but the action observed an ambiguous transport failure. */
export const deleteStorageIfUnreferenced = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const referenced = await ctx.db
      .query("items")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (referenced === null) {
      await safeDeleteStorage(ctx, args.storageId);
    }
    return null;
  },
});

export const listImagesNeedingRatioInternal = internalQuery({
  args: {},
  returns: v.array(
    v.object({ _id: v.id("items"), storageId: v.id("_storage") }),
  ),
  handler: async (ctx) => {
    const items = await ctx.db.query("items").take(LIST_CAP);
    const out: { _id: Id<"items">; storageId: Id<"_storage"> }[] = [];
    for (const item of items) {
      if (
        item.type === "image" &&
        item.storageId !== undefined &&
        item.aspectRatio === undefined
      ) {
        out.push({ _id: item._id, storageId: item.storageId });
      }
    }
    return out;
  },
});

export const setAspectRatioInternal = internalMutation({
  args: { itemId: v.id("items"), aspectRatio: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null) {
      return null;
    }
    await ctx.db.patch(args.itemId, { aspectRatio: args.aspectRatio });
    return null;
  },
});

export const setProductsInternal = internalMutation({
  args: {
    itemId: v.id("items"),
    products: v.optional(v.array(productValidator)),
    productsStatus: productsStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null) {
      return null;
    }
    await ctx.db.patch(args.itemId, {
      // On failure the previous results (if any) are kept; only the status
      // flips so the button can offer a retry.
      ...(args.products !== undefined ? { products: args.products } : {}),
      productsStatus: args.productsStatus,
    });
    return null;
  },
});

export const failItem = internalMutation({
  args: {
    itemId: v.id("items"),
    reason: failureReasonValidator,
    // See finalizeItem: the owning run's id, optional only for pre-fencing jobs.
    runId: v.optional(v.string()),
  },
  returns: runWriteOutcomeValidator,
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null) {
      return "missing";
    }
    // A superseded run must not fail an item a newer run is processing (or
    // has already finished): the user would see a failure for work that is
    // still in flight, or a `ready` item flip to `failed`.
    if (!ownsRun(item, args.runId)) {
      return "stale_run";
    }
    await ctx.db.patch(args.itemId, {
      status: "failed",
      failureReason: args.reason,
    });
    return "applied";
  },
});

/** Rows swept per transaction. A full page that made progress chains a
 * follow-up run so a backlog drains at scheduler speed. */
const STALE_PROCESSING_PAGE_SIZE = 100;

/**
 * Sweep `processing` items whose run started more than PROCESSING_STALE_MS ago
 * and mark them `failed` with reason `error` — the reason the client already
 * renders as "couldn't read this" with a Try again button. Their action died
 * outside its try block (runtime kill, timeout, OOM, deploy), so nothing else
 * will ever flip them; without this they spin forever and reprocessItem used
 * to refuse them.
 *
 * Pre-fencing rows carry no `processingStartedAt`. They sort at the front of
 * the index range (undefined precedes every number) and are judged by
 * `_creationTime` instead, so no backfill migration is needed. Such a row that
 * is not yet stale is skipped — it becomes stale on its own within the
 * threshold and the next tick takes it. The chain-on-full-page rule therefore
 * also requires progress: a full page of skipped rows must not loop at
 * scheduler speed until they age.
 *
 * The run id is left untouched on purpose: if the presumed-dead action does
 * finish, its finalizeItem still owns the row and repairs the item.
 */
export const failStaleProcessingItems = internalMutation({
  args: {},
  returns: v.object({ failed: v.number(), scanned: v.number() }),
  handler: async (ctx): Promise<{ failed: number; scanned: number }> => {
    const now = Date.now();
    const cutoff = now - PROCESSING_STALE_MS;
    const candidates = await ctx.db
      .query("items")
      .withIndex("by_status_and_processingStartedAt", (q) =>
        q.eq("status", "processing").lt("processingStartedAt", cutoff),
      )
      .take(STALE_PROCESSING_PAGE_SIZE);
    let failed = 0;
    for (const item of candidates) {
      if (!isStaleProcessing(item, now)) {
        continue;
      }
      await ctx.db.patch(item._id, {
        status: "failed",
        failureReason: "error",
      });
      failed++;
    }
    if (candidates.length === STALE_PROCESSING_PAGE_SIZE && failed > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.items.failStaleProcessingItems,
        {},
      );
    }
    return { failed, scanned: candidates.length };
  },
});

/**
 * The classifier's per-item output: which dynamic spaces this new save fits.
 * Writes are strictly `suggested`-only — rows the user owns (`saved`,
 * `dismissed`, or legacy status-less rows) are never created, changed, or
 * removed here, so the pipeline cannot clobber a user decision by
 * construction. Existing suggestions not in the new set are withdrawn.
 */
export const setSpacesForItem = internalMutation({
  args: {
    itemId: v.id("items"),
    spaceIds: v.array(v.id("spaces")),
    runId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (
      item === null ||
      (args.runId !== undefined && !ownsRun(item, args.runId))
    ) {
      return null;
    }
    const wanted = new Set(args.spaceIds);
    const existing = await ctx.db
      .query("spaceItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
    const touched = new Set<Id<"spaces">>();
    for (const join of existing) {
      touched.add(join.spaceId);
      if (effectiveStatus(join) === "suggested" && !wanted.has(join.spaceId)) {
        await deleteMembership(ctx, join);
      }
    }
    for (const spaceId of wanted) {
      // Any pre-existing row wins: already saved, already suggested, or
      // dismissed (the user said no — never re-suggest).
      if (touched.has(spaceId)) {
        continue;
      }
      const space = await ctx.db.get(spaceId);
      // Only suggest into dynamic spaces that exist and belong to the owner.
      if (
        space !== null &&
        space.userId === item.userId &&
        space.dynamic === true
      ) {
        await insertMembership(ctx, {
          userId: item.userId,
          spaceId,
          itemId: args.itemId,
          status: "suggested",
        });
      }
    }
    return null;
  },
});

/**
 * The recommendation pass for one space (creation, or dynamic toggled on).
 * Same invariant as setSpacesForItem: suggested rows in, nothing else touched.
 */
export const suggestItemsForSpace = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    itemIds: v.array(v.id("items")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (space === null) {
      return null;
    }
    // Any existing row blocks a new suggestion — saved and dismissed are
    // user decisions, and a live suggestion needn't be re-written. Checked
    // per item (the model returns at most a handful) instead of loading the
    // whole space's join list.
    const unique = [...new Set(args.itemIds)];
    for (const itemId of unique) {
      if ((await getMembership(ctx, itemId, args.spaceId)) !== null) {
        continue;
      }
      const item = await ctx.db.get(itemId);
      if (item !== null && item.userId === space.userId) {
        await insertMembership(ctx, {
          userId: space.userId,
          spaceId: args.spaceId,
          itemId,
          status: "suggested",
        });
      }
    }
    return null;
  },
});
