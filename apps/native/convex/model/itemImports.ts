import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUserId } from "./auth";
import { saveIntoSpace } from "./memberships";
import {
  isStorageUnreferenced,
  loadItemOperation,
  requireOperationId,
  safeDeleteStorage,
} from "./itemOperations";
import { rateLimiter } from "./rateLimiter";
import { requireProEntitlement } from "../subscriptions";

// Idempotent image save with a stable per-image operation ID:
//
//   begin -> upload bytes out-of-band -> attach storageId -> finalize item
//
// Convex makes each mutation transactional, but the upload itself is outside
// that transaction. If a process dies after upload and before attach, the blob
// ID was never persisted and no cleanup job can discover it. That narrow leak
// is an accepted limitation of the direct-upload API, not an invariant this
// state machine claims to solve. Once attach succeeds, the operation ledger
// owns compensation: racing retries converge on one canonical storage object,
// finalization creates one item, and stale pending operations are reclaimed.

const STORAGE_IN_USE = "Storage object is already in use";
const CLEANUP_PAGE_SIZE = 100;

export const STALE_IMPORT_CUTOFF_MS = 24 * 60 * 60 * 1000;

export const beginImageImportArgsValidator = v.object({
  operationId: v.string(),
});

export const beginImageImportResultValidator = v.union(
  v.object({ kind: v.literal("upload"), uploadUrl: v.string() }),
  v.object({ kind: v.literal("complete"), itemId: v.id("items") }),
);

export const attachImageUploadArgsValidator = v.object({
  operationId: v.string(),
  storageId: v.id("_storage"),
});

export const attachImageUploadResultValidator = v.object({
  storageId: v.id("_storage"),
});

export const finalizeImageImportArgsValidator = v.object({
  operationId: v.string(),
  aspectRatio: v.optional(v.number()),
  isSticker: v.optional(v.boolean()),
  capturedAt: v.optional(v.number()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  spaceId: v.optional(v.id("spaces")),
});

export const getImportOperationArgsValidator = v.object({
  operationId: v.string(),
});

export const getImportOperationResultValidator = v.union(
  v.object({
    status: v.union(v.literal("pending"), v.literal("complete")),
    itemId: v.optional(v.id("items")),
    storageId: v.optional(v.id("_storage")),
  }),
  v.null(),
);

type FinalizeImageImportArgs = Infer<
  typeof finalizeImageImportArgsValidator
>;

function validateImageMetadata(args: FinalizeImageImportArgs): void {
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

/** Begin or resume one durable image-import operation. */
export async function beginImageImportHandler(
  ctx: MutationCtx,
  args: Infer<typeof beginImageImportArgsValidator>,
): Promise<Infer<typeof beginImageImportResultValidator>> {
  const userId = await requireUserId(ctx);
  requireOperationId(args.operationId);
  const operation = await loadItemOperation(ctx, userId, args.operationId);
  const now = Date.now();

  if (
    operation?.status === "complete" &&
    operation.itemId !== undefined
  ) {
    const item = await ctx.db.get(operation.itemId);
    if (item !== null) {
      return { kind: "complete", itemId: operation.itemId };
    }
  }

  await requireProEntitlement(ctx, userId);

  if (operation === null) {
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

  if (operation.status === "complete") {
    if (
      operation.storageId !== undefined &&
      (await isStorageUnreferenced(
        ctx,
        operation.storageId,
        operation._id,
      ))
    ) {
      await safeDeleteStorage(ctx, operation.storageId);
    }
    await ctx.db.patch(operation._id, {
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

  await ctx.db.patch(operation._id, { updatedAt: now });
  return {
    kind: "upload",
    uploadUrl: await ctx.storage.generateUploadUrl(),
  };
}

/** Attach uploaded bytes to the durable operation; the first attachment wins. */
export async function attachImageUploadHandler(
  ctx: MutationCtx,
  args: Infer<typeof attachImageUploadArgsValidator>,
): Promise<Infer<typeof attachImageUploadResultValidator>> {
  const userId = await requireUserId(ctx);
  await requireProEntitlement(ctx, userId);
  requireOperationId(args.operationId);
  const operation = await loadItemOperation(ctx, userId, args.operationId);
  const now = Date.now();

  if (operation === null) {
    // The upload may have raced cleanup or skipped begin. Existence plus the
    // unreferenced guard is required before adopting a client-supplied ID.
    if ((await ctx.db.system.get("_storage", args.storageId)) === null) {
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

  if (operation.status === "complete") {
    // A retry lost the finalize race. Return the canonical object and reclaim
    // only the redundant upload, never storage referenced elsewhere.
    if (
      args.storageId !== operation.storageId &&
      (await isStorageUnreferenced(ctx, args.storageId))
    ) {
      await safeDeleteStorage(ctx, args.storageId);
    }
    return { storageId: operation.storageId ?? args.storageId };
  }

  if (
    operation.storageId !== undefined &&
    operation.storageId !== args.storageId
  ) {
    // First attachment wins. The incoming upload is redundant and may be
    // deleted only after the shared ownership guard approves it.
    if (await isStorageUnreferenced(ctx, args.storageId)) {
      await safeDeleteStorage(ctx, args.storageId);
    }
    await ctx.db.patch(operation._id, { updatedAt: now });
    return { storageId: operation.storageId };
  }

  if (operation.storageId === undefined) {
    if ((await ctx.db.system.get("_storage", args.storageId)) === null) {
      throw new Error("Storage object not found");
    }
    if (!(await isStorageUnreferenced(ctx, args.storageId))) {
      throw new Error(STORAGE_IN_USE);
    }
  }
  await ctx.db.patch(operation._id, {
    storageId: args.storageId,
    updatedAt: now,
  });
  return { storageId: args.storageId };
}

/** Finalize an attached upload into exactly one image item. */
export async function finalizeImageImportHandler(
  ctx: MutationCtx,
  args: FinalizeImageImportArgs,
): Promise<Id<"items">> {
  const userId = await requireUserId(ctx);
  requireOperationId(args.operationId);
  const operation = await loadItemOperation(ctx, userId, args.operationId);

  if (
    operation !== null &&
    operation.status === "complete" &&
    operation.itemId !== undefined
  ) {
    return operation.itemId;
  }

  await requireProEntitlement(ctx, userId);
  await rateLimiter.limit(ctx, "itemCreate", { key: userId, throws: true });
  validateImageMetadata(args);

  if (operation === null || operation.storageId === undefined) {
    throw new Error("Operation has no attached upload");
  }

  const itemId = await ctx.db.insert("items", {
    userId,
    type: "image",
    status: "processing",
    storageId: operation.storageId,
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
  await ctx.db.patch(operation._id, {
    status: "complete",
    itemId,
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.ai.processItem, { itemId });
  return itemId;
}

/** Read operation state without refreshing or creating a ledger row. */
export async function getImportOperationHandler(
  ctx: QueryCtx,
  args: Infer<typeof getImportOperationArgsValidator>,
): Promise<Infer<typeof getImportOperationResultValidator>> {
  const userId = await requireUserId(ctx);
  const operation = await ctx.db
    .query("itemOperations")
    .withIndex("by_user_operation", (query) =>
      query.eq("userId", userId).eq("operationId", args.operationId),
    )
    .unique();
  if (operation === null) return null;
  return {
    status: operation.status,
    itemId: operation.itemId,
    storageId: operation.storageId,
  };
}

/** Sweep one bounded page of abandoned image-import operations. */
export async function cleanupStaleImageImportsHandler(
  ctx: MutationCtx,
): Promise<null> {
  const cutoff = Date.now() - STALE_IMPORT_CUTOFF_MS;
  const stale = await ctx.db
    .query("itemOperations")
    .withIndex("by_kind_status_updated", (query) =>
      query
        .eq("kind", "image")
        .eq("status", "pending")
        .lt("updatedAt", cutoff),
    )
    .take(CLEANUP_PAGE_SIZE);

  for (const operation of stale) {
    if (
      operation.storageId !== undefined &&
      (await isStorageUnreferenced(
        ctx,
        operation.storageId,
        operation._id,
      ))
    ) {
      await safeDeleteStorage(ctx, operation.storageId);
    }
    await ctx.db.delete(operation._id);
  }

  if (stale.length === CLEANUP_PAGE_SIZE) {
    await ctx.scheduler.runAfter(
      0,
      internal.items.cleanupStaleImageImports,
      {},
    );
  }
  return null;
}
