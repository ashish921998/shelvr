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
import { liveOwner, requireUserId, senderFirstName } from "./model/auth";
import {
  hasProEntitlement,
  hasProEntitlementAt,
  hasProEntitlementStatus,
  requireProEntitlement,
} from "./subscriptions";
import { logEvent } from "./model/log";
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
import { sha256Hex } from "./model/captureTokens";
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
  buildEmbeddingText,
  CURRENT_EMBEDDING_VERSION,
  EMBEDDING_SWEEP_PAGE,
  isValidEmbedding,
  MAX_HYDRATE_READ_BYTES,
  MAX_EMBEDDING_ATTEMPTS,
  MAX_SWEEP_READ_BYTES,
} from "./model/embedding";
import {
  imageSizeError,
  imageSizeErrorCode,
  MAX_PHOTOS_PER_ACCOUNT,
} from "./model/imagePolicy";
import { saveError } from "./model/saveErrors";
import { MAX_DEMO_RETRIES } from "./model/demoErrors";
import { aiAllowed } from "./aiConsent";
import { aiConsentRequiredError } from "./model/aiConsent";
import { nextUpKind } from "./model/nextUp";
import { openedTooRecently, reminderSubject } from "./model/saveReminders";
import { saveSourceValidator, type SaveSource } from "./model/saveSource";
import { buildSearchText } from "./model/searchText";
import {
  hasSimilarSignal,
  rankSimilar,
  similarSearchTerms,
} from "./model/similarity";
import { completionPatch, failurePatch, runFields } from "./model/settlement";
import { safeDeleteStorage } from "./model/storage";

export { intentKindValidator, intentValidator, PROCESSING_STALE_MS };

const LIST_CAP = 1000;

export const LIST_PAGE_MAX = 100;
const LIST_PAGE_MAX_BYTES = 4 * 1024 * 1024;

export const RECENT_ITEMS_MAX = 20;

const NEXT_UP_SCAN_ROWS = 100;
const NEXT_UP_SCAN_BYTES = 2 * 1024 * 1024;
export const NEXT_UP_SKIP_MAX = 50;

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

export const productValidator = v.object({
  title: v.string(),
  url: v.string(),
  price: v.optional(v.string()),
  merchant: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
});

const productsStatusValidator = v.union(
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
  cities: v.optional(v.array(v.string())),
  products: v.optional(v.array(productValidator)),
  productsStatus: v.optional(productsStatusValidator),
  failureReason: v.optional(failureReasonValidator),
  enrichment: v.optional(enrichmentValidator),
  processingRunId: v.optional(v.string()),
  processingStartedAt: v.optional(v.number()),
  searchText: v.string(),
};

/** Every write that sets `status: "processing"` must spread this in. */
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

const runWriteOutcomeValidator = v.union(
  v.literal("applied"),
  v.literal("stale_run"),
  v.literal("settled"),
  v.literal("missing"),
);

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

export const itemCardValidator = enrichedItemValidator
  .omit(
    "userId",
    "content",
    "articleMedia",
    "recipe",
    "searchText",
    "products",
    "productsStatus",
  )
  .extend({
    hasRecipe: v.optional(v.literal(true)),
  });

export type ItemCard = Infer<typeof itemCardValidator>;

function stripEmbedding(
  item: Doc<"items">,
): Omit<
  Doc<"items">,
  | "embedding"
  | "embeddingVersion"
  | "embeddingAttempts"
  | "productsSearchStartedAt"
  | "places"
> {
  const {
    places: _places,
    embedding: _embedding,
    embeddingVersion: _version,
    embeddingAttempts: _attempts,
    productsSearchStartedAt: _searchStartedAt,
    ...rest
  } = item;
  return rest;
}

export async function enrichItem(ctx: QueryCtx, item: Doc<"items">) {
  const imageUrl = item.storageId
    ? await ctx.storage.getUrl(item.storageId)
    : null;
  return {
    ...stripEmbedding(item),
    imageUrl,
    heroImageUrl: item.type === "link" ? (imageUrl ?? undefined) : undefined,
  };
}

async function toItemCard(
  ctx: QueryCtx,
  item: Doc<"items">,
): Promise<ItemCard> {
  const {
    userId: _userId,
    content: _content,
    articleMedia: _articleMedia,
    recipe,
    searchText: _searchText,
    products: _products,
    productsStatus: _productsStatus,
    ...card
  } = await enrichItem(ctx, item);
  return recipe ? { ...card, hasRecipe: true } : card;
}

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

const SAVE_PROGRESS_GOAL = 3;
const SAVE_PROGRESS_MAX_READ = 20;

export const saveProgress = query({
  args: {},
  returns: v.object({ saved: v.number(), goal: v.number() }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const demo = await ctx.db
      .query("onboardingDemos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    let saved = 0;
    let read = 0;
    for await (const item of ctx.db
      .query("items")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "ready"),
      )) {
      if (item._id !== demo?.itemId && item.fixtureKey === undefined) saved++;
      read++;
      if (saved >= SAVE_PROGRESS_GOAL || read >= SAVE_PROGRESS_MAX_READ) break;
    }
    return {
      saved: Math.min(saved, SAVE_PROGRESS_GOAL),
      goal: SAVE_PROGRESS_GOAL,
    };
  },
});

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

export const listRecentItems = query({
  args: { limit: v.number(), now: v.optional(v.number()) },
  returns: v.array(itemCardValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const entitled =
      (await hasProEntitlementStatus(ctx, userId)) &&
      (args.now === undefined ||
        (await hasProEntitlementAt(ctx, userId, args.now)));
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

/** `now` is passed in because a Convex query does not rerun as time passes. */
export const nextUp = query({
  args: { now: v.number(), skip: v.array(v.id("items")) },
  returns: v.union(
    v.null(),
    v.object({
      kind: v.union(
        v.literal("read"),
        v.literal("cook"),
        v.literal("watch"),
        v.literal("open"),
      ),
      subject: v.string(),
      item: itemCardValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (
      !(await hasProEntitlementStatus(ctx, userId)) ||
      !(await hasProEntitlementAt(ctx, userId, args.now))
    )
      return null;
    const skip = new Set<string>(args.skip.slice(-NEXT_UP_SKIP_MAX));
    const { rows } = await takeWithinBytes(
      ctx.db
        .query("items")
        .withIndex("by_user_and_status", (q) =>
          q.eq("userId", userId).eq("status", "ready"),
        )
        .order("desc"),
      { maxRows: NEXT_UP_SCAN_ROWS, maxBytes: NEXT_UP_SCAN_BYTES },
    );
    const demo = await ctx.db
      .query("onboardingDemos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    for (const item of rows) {
      if (skip.has(item._id) || item._id === demo?.itemId) continue;
      const kind = nextUpKind(item, args.now);
      if (kind === undefined) continue;
      const reminder = kind === "cook" ? "cook" : "read";
      const subject = reminderSubject(item, reminder);
      if (subject === undefined) continue;
      const read = await ctx.db
        .query("itemReads")
        .withIndex("by_user_and_item", (q) =>
          q.eq("userId", userId).eq("itemId", item._id),
        )
        .unique();
      if (openedTooRecently(reminder, read?.lastOpenedAt, args.now)) continue;
      return { kind, subject, item: await toItemCard(ctx, item) };
    }
    return null;
  },
});

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
    // The space reads and the image URL go out together.
    const [rows, enriched] = await Promise.all([
      Promise.all(
        joins
          .filter((join) => effectiveStatus(join) === "saved")
          .map((join) => ctx.db.get(join.spaceId)),
      ),
      enrichItem(ctx, item),
    ]);
    const spaces = rows
      .filter((space): space is Doc<"spaces"> => space !== null)
      .map((space) => ({ _id: space._id, name: space.name }));
    return { ...enriched, spaces };
  },
});

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

const SIMILAR_CANDIDATES = 300;
const SIMILAR_SEARCH_CANDIDATES = 100;
// Headroom under Convex's 16 MiB per-query read limit.
const SIMILAR_READ_BYTES = 13 * 1024 * 1024;
const SIMILAR_SEARCH_BYTES = 3 * 1024 * 1024;
const SIMILAR_RECENT_MIN_BYTES = SIMILAR_READ_BYTES - SIMILAR_SEARCH_BYTES;

export const similarItems = query({
  args: { id: v.id("items") },
  returns: v.array(itemCardValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (item === null || item.userId !== userId || item.status !== "ready") {
      return [];
    }
    if (!hasSimilarSignal(item)) {
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

    return await Promise.all(
      rankSimilar(item, candidates.values()).map((match) =>
        toItemCard(ctx, match),
      ),
    );
  },
});

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

type OperationKind = "image" | "link" | "note";

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

/** Convex direct uploads carry no uploader identity, so this proves "unreferenced", not "owned by the caller". */
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

async function countPhotos(ctx: QueryCtx, userId: string): Promise<number> {
  const photos = await ctx.db
    .query("items")
    .withIndex("by_user_and_type", (q) =>
      q.eq("userId", userId).eq("type", "image"),
    )
    .take(MAX_PHOTOS_PER_ACCOUNT);
  return photos.length;
}

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

type BeginImageImportResult =
  | { kind: "upload"; uploadUrl: string }
  | { kind: "complete"; itemId: Id<"items"> };

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
    return await beginImageImportForUser(ctx, userId, args.operationId);
  },
});

export async function beginImageImportForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  operationId: string,
): Promise<BeginImageImportResult> {
  requireOperationId(operationId);
  const op = await loadItemOperation(ctx, userId, operationId);
  const now = Date.now();

  if (op?.status === "complete" && op.itemId !== undefined) {
    const item = await ctx.db.get(op.itemId);
    if (item !== null) {
      return { kind: "complete", itemId: op.itemId };
    }
  }

  await requireProEntitlement(ctx, userId);
  const photoCount = await requirePhotoQuota(ctx, userId);
  if (
    op?.status === "pending" &&
    op.uploadUrl &&
    op.uploadUrlIssuedAt !== undefined &&
    now - op.uploadUrlIssuedAt < 55 * 60 * 1000
  ) {
    return { kind: "upload", uploadUrl: op.uploadUrl };
  }
  await rateLimiter.limit(ctx, "imageBegin", { key: userId, throws: true });
  if (op?.status !== "pending") {
    const pending = await ctx.db
      .query("itemOperations")
      .withIndex("by_user_and_kind_and_status", (q) =>
        q.eq("userId", userId).eq("kind", "image").eq("status", "pending"),
      )
      .take(30);
    if (pending.length >= 30) throw new Error("Too many pending image imports");
    if (photoCount + pending.length >= MAX_PHOTOS_PER_ACCOUNT)
      throw saveError("photo_limit");
  }

  // Math.random is deterministic in a Convex mutation, so the platform upload URL supplies the entropy.
  const platformUrl = await ctx.storage.generateUploadUrl();
  const uploadToken = await sha256Hex(platformUrl);
  const uploadTokenHash = await sha256Hex(uploadToken);
  const siteOrigin =
    process.env.CONVEX_SITE_URL ??
    new URL(platformUrl).origin.replace(".convex.cloud", ".convex.site");
  const uploadUrl = `${siteOrigin.replace(/\/+$/, "")}/image-upload?token=${uploadToken}`;
  if (op === null) {
    // Convex has no unique indexes: OCC retries a racing begin, which then finds this row.
    await ctx.db.insert("itemOperations", {
      userId,
      operationId: operationId,
      kind: "image",
      status: "pending",
      updatedAt: now,
      uploadUrl,
      uploadUrlIssuedAt: now,
      uploadTokenHash,
    });
    return {
      kind: "upload",
      uploadUrl,
    };
  }

  if (op.status === "complete") {
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
      uploadUrl,
      uploadUrlIssuedAt: now,
      uploadTokenHash,
      uploadClaimedAt: undefined,
    });
    return {
      kind: "upload",
      uploadUrl,
    };
  }

  await ctx.db.patch(op._id, {
    updatedAt: now,
    uploadUrl,
    uploadUrlIssuedAt: now,
    uploadTokenHash,
    uploadClaimedAt: undefined,
  });
  return {
    kind: "upload",
    uploadUrl,
  };
}

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
    return await attachImageUploadForUser(ctx, userId, args);
  },
});

export const claimImageUpload = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.object({
      kind: v.literal("accept"),
      operationId: v.id("itemOperations"),
      claimTime: v.number(),
    }),
    v.object({ kind: v.literal("stored"), storageId: v.id("_storage") }),
    v.object({ kind: v.literal("busy") }),
    v.object({ kind: v.literal("reject") }),
  ),
  handler: async (ctx, { tokenHash }) => {
    const op = await ctx.db
      .query("itemOperations")
      .withIndex("by_upload_token_hash", (q) =>
        q.eq("uploadTokenHash", tokenHash),
      )
      .unique();
    const now = Date.now();
    if (
      !op ||
      op.kind !== "image" ||
      now - (op.uploadUrlIssuedAt ?? 0) >= 60 * 60 * 1000
    )
      return { kind: "reject" as const };
    const userId = ctx.db.normalizeId("users", op.userId);
    if (!userId) return { kind: "reject" as const };
    await requireProEntitlement(ctx, userId);
    if (op.storageId)
      return { kind: "stored" as const, storageId: op.storageId };
    if (op.status !== "pending") return { kind: "reject" as const };
    if (op.uploadClaimedAt !== undefined && now - op.uploadClaimedAt < 60_000)
      return { kind: "busy" as const };
    await rateLimiter.limit(ctx, "imageUpload", {
      key: op.userId,
      throws: true,
    });
    await ctx.db.patch(op._id, { uploadClaimedAt: now, updatedAt: now });
    return { kind: "accept" as const, operationId: op._id, claimTime: now };
  },
});

export const finishImageUpload = internalMutation({
  args: {
    operationId: v.id("itemOperations"),
    claimTime: v.number(),
    storageId: v.optional(v.id("_storage")),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (
      !op ||
      op.status !== "pending" ||
      op.uploadClaimedAt !== args.claimTime ||
      op.storageId
    ) {
      if (args.storageId && (await isStorageUnreferenced(ctx, args.storageId)))
        await safeDeleteStorage(ctx, args.storageId);
      return false;
    }
    await ctx.db.patch(op._id, {
      storageId: args.storageId,
      uploadClaimedAt: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export async function attachImageUploadForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { operationId: string; storageId: Id<"_storage"> },
): Promise<{ storageId: Id<"_storage">; error?: string }> {
  await requireProEntitlement(ctx, userId);
  requireOperationId(args.operationId);
  const op = await loadItemOperation(ctx, userId, args.operationId);
  const now = Date.now();

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
    if (
      args.storageId !== op.storageId &&
      (await isStorageUnreferenced(ctx, args.storageId))
    ) {
      await safeDeleteStorage(ctx, args.storageId);
    }
    return { storageId: op.storageId ?? args.storageId };
  }

  if (op.storageId !== undefined && op.storageId !== args.storageId) {
    if (await isStorageUnreferenced(ctx, args.storageId)) {
      await safeDeleteStorage(ctx, args.storageId);
    }
    await ctx.db.patch(op._id, { updatedAt: now });
    return { storageId: op.storageId };
  }
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
}

const finalizeImageImportArgs = v.object({
  operationId: v.string(),
  analyticsSessionId: v.optional(v.string()),
  saveSource: v.optional(saveSourceValidator),
  aspectRatio: v.optional(v.number()),
  isSticker: v.optional(v.boolean()),
  capturedAt: v.optional(v.number()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  spaceId: v.optional(v.id("spaces")),
});

type FinalizeImageImportArgs = Infer<typeof finalizeImageImportArgs> & {
  captureContext?: string;
};

export const finalizeImageImport = mutation({
  args: finalizeImageImportArgs.fields,
  returns: v.id("items"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await finalizeImageImportForUser(ctx, userId, args);
  },
});

export async function finalizeImageImportForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: FinalizeImageImportArgs,
): Promise<Id<"items">> {
  requireOperationId(args.operationId);

  const op = await loadItemOperation(ctx, userId, args.operationId);

  if (op !== null && op.status === "complete" && op.itemId !== undefined) {
    return op.itemId;
  }

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

  validateImageMetadata(args);

  if (op === null) {
    throw new Error("Operation has no attached upload");
  }
  if (op.storageId === undefined) {
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
    captureContext: args.captureContext,
  });
  await scheduleSaveTelemetry(ctx, itemId, {
    sessionId: args.analyticsSessionId,
    saveSource: args.saveSource,
    operationId: args.operationId,
    photoCount: photoCount + 1,
    storedBytes,
  });
  return itemId;
}

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

export const STALE_IMPORT_CUTOFF_MS = 24 * 60 * 60 * 1000;

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
      if (
        op.storageId !== undefined &&
        (await isStorageUnreferenced(ctx, op.storageId, op._id))
      ) {
        await safeDeleteStorage(ctx, op.storageId);
      }
      await ctx.db.delete(op._id);
    }
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

export const cleanupOrphanStorage = internalMutation({
  args: { cursor: v.optional(v.string()), cutoff: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const cutoff = args.cutoff ?? Date.now() - 2 * STALE_IMPORT_CUTOFF_MS;
    const page = await ctx.db.system
      .query("_storage")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .paginate({ cursor: args.cursor ?? null, numItems: CLEANUP_PAGE_SIZE });
    for (const blob of page.page) {
      if (await isStorageUnreferenced(ctx, blob._id)) {
        await safeDeleteStorage(ctx, blob._id);
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.items.cleanupOrphanStorage, {
        cursor: page.continueCursor,
        cutoff,
      });
    }
    return null;
  },
});

export async function createItemWithOperation(
  ctx: MutationCtx,
  userId: string,
  kind: Extract<OperationKind, "link" | "note">,
  payload: { url: string } | { note: string },
  options: {
    operationId?: string;
    spaceId?: Id<"spaces">;
    analyticsSessionId?: string;
    saveSource?: SaveSource;
    captureContext?: string;
  },
): Promise<Id<"items">> {
  const now = Date.now();

  validateLinkOrNotePayload(kind, payload);

  if (options.operationId !== undefined) {
    requireOperationId(options.operationId);
    const op = await loadItemOperation(ctx, userId, options.operationId, kind);
    if (op !== null) {
      if (op.status === "complete" && op.itemId !== undefined) {
        const item = await ctx.db.get(op.itemId);
        if (item !== null) {
          return op.itemId;
        }
      }
      await ctx.db.patch(op._id, { status: "pending", itemId: undefined });
    }

    await rateLimiter.limit(ctx, "itemCreate", { key: userId, throws: true });
    const itemId = await createLinkOrNote(ctx, userId, kind, payload, options);
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
    return itemId;
  }

  await rateLimiter.limit(ctx, "itemCreate", { key: userId, throws: true });
  return await createLinkOrNote(ctx, userId, kind, payload, options);
}

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
  if (payload.note.length > MAX_NOTE_TEXT_CHARS) {
    throw new Error("Note text is too long");
  }
}

async function createLinkOrNote(
  ctx: MutationCtx,
  userId: string,
  kind: Extract<OperationKind, "link" | "note">,
  payload: { url: string } | { note: string },
  options: {
    spaceId?: Id<"spaces">;
    analyticsSessionId?: string;
    saveSource?: SaveSource;
    operationId?: string;
    captureContext?: string;
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
    searchText:
      kind === "note" && "note" in payload
        ? buildSearchText({ tags: [], note: payload.note })
        : "",
  });
  if (options.spaceId !== undefined) {
    await saveIntoSpace(ctx, userId, itemId, options.spaceId);
  }
  await ctx.scheduler.runAfter(0, internal.ai.processItem, {
    itemId,
    runId: run.processingRunId,
    captureContext: options.captureContext,
  });
  await scheduleSaveTelemetry(ctx, itemId, {
    sessionId: options.analyticsSessionId,
    saveSource: options.saveSource,
    operationId: options.operationId,
  });
  return itemId;
}

async function scheduleSaveTelemetry(
  ctx: MutationCtx,
  itemId: Id<"items">,
  telemetry?: {
    sessionId?: string;
    saveSource?: SaveSource;
    operationId?: string;
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

async function scheduleProcessedTelemetry(
  ctx: MutationCtx,
  item: Pick<
    Doc<"items">,
    "_id" | "_creationTime" | "userId" | "type" | "processingStartedAt"
  >,
  outcome:
    | { status: "ready"; enrichment?: Infer<typeof enrichmentValidator> }
    | {
        status: "failed";
        failureReason: Infer<typeof failureReasonValidator>;
      },
): Promise<void> {
  const now = Date.now();
  await ctx.scheduler.runAfter(0, internal.analytics.captureItemProcessed, {
    itemId: item._id,
    userId: item.userId,
    itemType: item.type,
    outcome: outcome.status,
    ...(outcome.status === "failed"
      ? { failureReason: outcome.failureReason }
      : { enrichment: outcome.enrichment }),
    processingMs: Math.max(
      0,
      now - (item.processingStartedAt ?? item._creationTime),
    ),
    finishedAt: now,
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
    return await createItemWithOperation(
      ctx,
      userId,
      "note",
      { note: args.text },
      {
        operationId: args.operationId,
        spaceId: args.spaceId,
        analyticsSessionId: args.analyticsSessionId,
        saveSource: args.saveSource ?? "note",
      },
    );
  },
});

const MAX_IMPORT_BATCH = 50;

export const IMPORT_STAGGER_MS = 1000;

const MAX_IMPORT_STAGGER_OFFSET = 1000;

const importLinksResultValidator = v.object({
  created: v.number(),
  skipped: v.number(),
  invalid: v.number(),
  notProcessed: v.number(),
  rateLimited: v.boolean(),
});

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

export const importLinks = mutation({
  args: {
    urls: v.array(v.string()),
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

export const NOTE_REFRESH_DELAY_MS = 20_000;

async function noteRunDelay(
  ctx: MutationCtx,
  item: Doc<"items">,
): Promise<number> {
  if (item.status !== "processing") {
    return NOTE_REFRESH_DELAY_MS;
  }
  const { ok, retryAfter } = await rateLimiter.limit(ctx, "noteRefresh", {
    key: item.userId,
  });
  return ok
    ? NOTE_REFRESH_DELAY_MS
    : Math.max(NOTE_REFRESH_DELAY_MS, retryAfter ?? 0);
}

export const updateNoteItem = mutation({
  args: {
    id: v.id("items"),
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
    const title =
      typedTitle !== ""
        ? typedTitle
        : item.titleSource === "user"
          ? undefined
          : item.title;
    const runDelay =
      (textChanged || (titleChanged && typedTitle === "")) &&
      item.status !== "failed"
        ? await noteRunDelay(ctx, item)
        : undefined;
    const refreshRunId =
      runDelay !== undefined ? crypto.randomUUID() : undefined;
    await ctx.db.patch(item._id, {
      note: text,
      title,
      titleSource: typedTitle !== "" ? "user" : undefined,
      searchText: buildSearchText({
        title,
        description: item.description,
        tags: item.tags,
        note: text,
        content: item.content,
      }),
      embeddingVersion: undefined,
      embeddingAttempts: undefined,
      ...(refreshRunId !== undefined ? { processingRunId: refreshRunId } : {}),
      ...(refreshRunId !== undefined && item.status === "processing"
        ? { processingStartedAt: Date.now() }
        : {}),
    });
    if (refreshRunId !== undefined) {
      await ctx.scheduler.runAfter(
        runDelay ?? NOTE_REFRESH_DELAY_MS,
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
    if (!(await aiAllowed(ctx, userId))) {
      throw aiConsentRequiredError();
    }
    await rateLimiter.limit(ctx, "findLinks", { key: userId, throws: true });
    const startedAt = Date.now();
    await ctx.db.patch(item._id, {
      productsStatus: "searching",
      productsSearchStartedAt: startedAt,
    });
    await ctx.scheduler.runAfter(0, internal.ai.findProductLinks, {
      itemId: item._id,
    });
    await ctx.scheduler.runAfter(
      PROCESSING_STALE_MS,
      internal.items.expireProductSearch,
      { itemId: item._id, startedAt },
    );
    return null;
  },
});

async function freeDemoRetry(
  ctx: MutationCtx,
  userId: Id<"users">,
  itemId: Id<"items">,
): Promise<Doc<"onboardingDemos"> | null> {
  const demo = await ctx.db
    .query("onboardingDemos")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (demo === null || demo.itemId !== itemId) return null;
  if ((demo.retryCount ?? 0) >= MAX_DEMO_RETRIES) return null;
  if (await hasProEntitlement(ctx, userId)) return null;
  return demo;
}

export const reprocessItem = mutation({
  args: { id: v.id("items") },
  // True when a new run was scheduled; false when the server does not consider the item retryable.
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const freeDemo = await freeDemoRetry(ctx, userId, args.id);
    if (freeDemo === null) await requireProEntitlement(ctx, userId);
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
    if (freeDemo !== null) {
      await rateLimiter.limit(ctx, "demoRetry", { key: userId, throws: true });
      await ctx.db.patch(freeDemo._id, {
        retryCount: (freeDemo.retryCount ?? 0) + 1,
      });
    } else {
      await rateLimiter.limit(ctx, "reprocessItem", {
        key: userId,
        throws: true,
      });
    }
    const run = beginProcessingRun();
    await ctx.db.patch(args.id, {
      ...run,
      failureReason: undefined,
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
    await deleteMembershipsForItem(ctx, item._id);
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
      await safeDeleteStorage(ctx, item.storageId);
    }
    await ctx.db.delete(item._id);
    return null;
  },
});

export const createShareLink = mutation({
  args: {
    itemId: v.id("items"),
    // Set by clients that call `settleShareLink` afterwards; without it the link is never withdrawn.
    settles: v.optional(v.boolean()),
  },
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
    if (existing !== null) {
      if (existing.confirmedAt === undefined || existing.pending === true) {
        await ctx.db.patch(existing._id, {
          confirmedAt: existing.confirmedAt ?? Date.now(),
          pending: undefined,
        });
      }
      return existing.token;
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await ctx.db.insert("shareLinks", {
      token,
      userId,
      itemId: item._id,
      ...(args.settles === true ? { pending: true } : {}),
    });
    return token;
  },
});

export const settleShareLink = mutation({
  args: { itemId: v.id("items"), shared: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    const links = await ctx.db
      .query("shareLinks")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .take(10);
    for (const link of links) {
      if (args.shared) {
        if (link.confirmedAt === undefined || link.pending === true) {
          await ctx.db.patch(link._id, {
            confirmedAt: link.confirmedAt ?? Date.now(),
            pending: undefined,
          });
        }
      } else if (link.pending === true && link.confirmedAt === undefined) {
        await ctx.db.delete(link._id);
      }
    }
    return null;
  },
});

function isShareable(item: Doc<"items">): boolean {
  return item.status === "ready" && item.type !== "image";
}

/** The save as a processing run reads it: with its places, which a rerun keeps. */
export const getItemInternal = internalQuery({
  args: { itemId: v.id("items") },
  returns: v.union(
    v.object({ ...itemFields, places: v.optional(v.array(v.string())) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null) return null;
    const { places } = item;
    return { ...stripEmbedding(item), ...(places ? { places } : {}) };
  },
});

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
      senderName: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { token }) => {
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (link === null) return null;
    if ((await liveOwner(ctx, link.userId)) === null) return null;
    const item = await ctx.db.get(link.itemId);
    if (!item || item.userId !== link.userId || !isShareable(item)) return null;

    const { imageUrl } = await enrichItem(ctx, item);
    return {
      type: item.type,
      title: item.title ?? "A save from Shelvr",
      description: item.description,
      imageUrl: imageUrl ?? undefined,
      sourceUrl: item.type === "link" ? item.url : undefined,
      noteText: item.type === "note" ? item.note?.slice(0, 500) : undefined,
      senderName: await senderFirstName(ctx, link.userId),
    };
  },
});

export const listReadyItemsInternal = internalQuery({
  args: { userId: v.string(), limit: v.number() },
  returns: v.array(v.object(itemFields)),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, Math.floor(args.limit)), 200);
    const rows = await ctx.db
      .query("items")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "ready"),
      )
      .order("desc")
      .take(limit);
    return rows.map(stripEmbedding);
  },
});

/** Convex vector filters cannot AND fields, so non-ready and old-generation hits are dropped here. */
export const listReadyItemsByIdInternal = internalQuery({
  args: {
    userId: v.string(),
    itemIds: v.array(v.id("items")),
    limit: v.number(),
  },
  returns: v.array(v.object(itemFields)),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(1, Math.floor(args.limit)), 200);
    const rows: Doc<"items">[] = [];
    let bytes = 0;
    for (const itemId of args.itemIds) {
      if (rows.length >= limit || bytes >= MAX_HYDRATE_READ_BYTES) {
        break;
      }
      const item = await ctx.db.get(itemId);
      if (item === null) {
        continue;
      }
      bytes += (item.content?.length ?? 0) + (item.note?.length ?? 0);
      if (
        item.userId !== args.userId ||
        item.status !== "ready" ||
        item.embeddingVersion !== CURRENT_EMBEDDING_VERSION
      ) {
        continue;
      }
      rows.push(item);
    }
    return rows.map(stripEmbedding);
  },
});

function ownsRun(item: Doc<"items">, runId: string | undefined): boolean {
  return item.processingRunId === runId;
}

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
    runId: v.optional(v.string()),
    ...runFields,
  },
  returns: runWriteOutcomeValidator,
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    const allowed = item !== null && (await aiAllowed(ctx, item.userId));
    if (item === null) {
      return "missing";
    }
    if (!ownsRun(item, args.runId)) {
      return "stale_run";
    }
    await ctx.db.patch(args.itemId, completionPatch(item, args, allowed));
    const { storageId, enrichment } = args.reading;
    if (
      storageId !== undefined &&
      item.storageId !== undefined &&
      item.storageId !== storageId &&
      (await isStorageUnreferenced(ctx, item.storageId))
    ) {
      await safeDeleteStorage(ctx, item.storageId);
    }
    if (item.status !== "ready") {
      await scheduleProcessedTelemetry(ctx, item, {
        status: "ready",
        enrichment,
      });
    }
    return "applied";
  },
});

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

export const listItemsNeedingEmbeddingInternal = internalQuery({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      itemId: v.id("items"),
      userId: v.string(),
      text: v.string(),
      aiDeclined: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(
      Math.max(1, Math.floor(args.limit)),
      EMBEDDING_SWEEP_PAGE,
    );
    // In a Convex index undefined sorts before every number, so this also matches rows never embedded.
    const rows = ctx.db
      .query("items")
      .withIndex("by_status_and_embeddingVersion", (q) =>
        q
          .eq("status", "ready")
          .lt("embeddingVersion", CURRENT_EMBEDDING_VERSION),
      );
    const page: {
      itemId: Id<"items">;
      userId: string;
      text: string;
      aiDeclined?: true;
    }[] = [];
    const allowedByUser = new Map<string, boolean>();
    let bytes = 0;
    for await (const item of rows) {
      let allowed = allowedByUser.get(item.userId);
      if (allowed === undefined) {
        allowed = await aiAllowed(ctx, item.userId);
        allowedByUser.set(item.userId, allowed);
      }
      page.push({
        itemId: item._id,
        userId: item.userId,
        ...(allowed ? {} : { aiDeclined: true as const }),
        text: buildEmbeddingText({
          title: item.title,
          description: item.description,
          tags: item.tags,
          siteName: item.siteName,
          note: item.note,
          content: item.content,
        }),
      });
      bytes += (item.content?.length ?? 0) + (item.note?.length ?? 0);
      if (page.length >= limit || bytes >= MAX_SWEEP_READ_BYTES) {
        break;
      }
    }
    return page;
  },
});

const embeddingOutcomeValidator = v.union(
  v.literal("ai_declined"),
  v.literal("embedded"),
  v.literal("nothing_to_embed"),
  v.literal("failed"),
  v.literal("deferred"),
);

export const setEmbeddingsInternal = internalMutation({
  args: {
    entries: v.array(
      v.object({
        itemId: v.id("items"),
        text: v.string(),
        embedding: v.optional(v.array(v.float64())),
        outcome: embeddingOutcomeValidator,
      }),
    ),
  },
  returns: v.object({
    written: v.number(),
    stamped: v.number(),
    deferred: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ written: number; stamped: number; deferred: number }> => {
    let written = 0;
    let stamped = 0;
    let deferred = 0;
    for (const entry of args.entries) {
      const item = await ctx.db.get(entry.itemId);
      if (item === null) {
        continue;
      }
      if ((item.embeddingVersion ?? -1) >= CURRENT_EMBEDDING_VERSION) {
        continue;
      }

      const nextSearchText = buildSearchText({
        title: item.title,
        description: item.description,
        tags: item.tags,
        siteName: item.siteName,
        note: item.note,
        content: item.content,
      });
      const reindex =
        nextSearchText === item.searchText
          ? {}
          : { searchText: nextSearchText };

      if (entry.outcome === "ai_declined") {
        if (await aiAllowed(ctx, item.userId)) continue;
        await ctx.db.patch(entry.itemId, {
          ...reindex,
          embedding: undefined,
          embeddingVersion: CURRENT_EMBEDDING_VERSION,
          embeddingAttempts: undefined,
        });
        stamped++;
        continue;
      }

      const currentText = buildEmbeddingText({
        title: item.title,
        description: item.description,
        tags: item.tags,
        siteName: item.siteName,
        note: item.note,
        content: item.content,
      });
      if (currentText !== entry.text) {
        if (reindex.searchText !== undefined) {
          await ctx.db.patch(entry.itemId, reindex);
        }
        deferred++;
        continue;
      }

      const usable =
        entry.outcome === "embedded" &&
        entry.embedding !== undefined &&
        isValidEmbedding(entry.embedding);

      if (usable) {
        if (!(await aiAllowed(ctx, item.userId))) continue;
        await ctx.db.patch(entry.itemId, {
          ...reindex,
          embedding: entry.embedding,
          embeddingVersion: CURRENT_EMBEDDING_VERSION,
          embeddingAttempts: undefined,
        });
        written++;
        stamped++;
        continue;
      }

      if (entry.outcome === "nothing_to_embed") {
        await ctx.db.patch(entry.itemId, {
          ...reindex,
          embeddingVersion: CURRENT_EMBEDDING_VERSION,
        });
        stamped++;
        continue;
      }

      if (entry.outcome === "deferred") {
        if (reindex.searchText !== undefined) {
          await ctx.db.patch(entry.itemId, reindex);
        }
        deferred++;
        continue;
      }

      const attempts = (item.embeddingAttempts ?? 0) + 1;
      const givingUp = attempts >= MAX_EMBEDDING_ATTEMPTS;
      await ctx.db.patch(entry.itemId, {
        ...reindex,
        embeddingAttempts: attempts,
        ...(givingUp ? { embeddingVersion: CURRENT_EMBEDDING_VERSION } : {}),
      });
      if (givingUp) {
        stamped++;
      } else {
        deferred++;
      }
    }
    return { written, stamped, deferred };
  },
});

export const expireProductSearch = internalMutation({
  args: { itemId: v.id("items"), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (
      item === null ||
      item.productsStatus !== "searching" ||
      item.productsSearchStartedAt !== args.startedAt
    ) {
      return null;
    }
    logEvent("warn", "find_product_links_expired", { item_id: args.itemId });
    await ctx.db.patch(args.itemId, { productsStatus: "failed" });
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
    runId: v.optional(v.string()),
  },
  returns: runWriteOutcomeValidator,
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item === null) {
      return "missing";
    }
    if (!ownsRun(item, args.runId)) {
      return "stale_run";
    }
    const patch = failurePatch(item, args.reason);
    if (patch === null) {
      return "settled";
    }
    await ctx.db.patch(args.itemId, patch);
    await scheduleProcessedTelemetry(ctx, item, {
      status: "failed",
      failureReason: args.reason,
    });
    return "applied";
  },
});

const STALE_PROCESSING_PAGE_SIZE = 100;

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
      const patch = failurePatch(item, "error");
      if (!isStaleProcessing(item, now) || patch === null) {
        continue;
      }
      await ctx.db.patch(item._id, patch);
      await scheduleProcessedTelemetry(ctx, item, {
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

function autoFiles(space: Doc<"spaces">, item: Doc<"items">): boolean {
  return (
    space.autoFile === true &&
    space.autoFileSince !== undefined &&
    item._creationTime >= space.autoFileSince
  );
}

export const setSpacesForItem = internalMutation({
  args: {
    itemId: v.id("items"),
    spaceIds: v.array(v.id("spaces")),
    runId: v.optional(v.string()),
  },
  returns: v.array(v.id("spaces")),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (
      item === null ||
      (args.runId !== undefined && !ownsRun(item, args.runId))
    ) {
      return [];
    }
    if (!(await aiAllowed(ctx, item.userId))) return [];
    const autoFiled: Id<"spaces">[] = [];
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
      if (touched.has(spaceId)) {
        continue;
      }
      const space = await ctx.db.get(spaceId);
      if (
        space !== null &&
        space.userId === item.userId &&
        space.dynamic === true
      ) {
        const status = autoFiles(space, item) ? "saved" : "suggested";
        await insertMembership(ctx, {
          userId: item.userId,
          spaceId,
          itemId: args.itemId,
          status,
        });
        if (status === "saved") autoFiled.push(spaceId);
      }
    }
    return autoFiled;
  },
});

export const suggestItemsForSpace = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    itemIds: v.array(v.id("items")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (space === null || !(await aiAllowed(ctx, space.userId))) {
      return null;
    }
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
