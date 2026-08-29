import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const OPERATION_ID_MIN = 8;
const OPERATION_ID_MAX = 200;

export type OperationKind = "image" | "link" | "note";

/** Keep malformed operation IDs out of the idempotency index. */
export function requireOperationId(operationId: string): void {
  if (
    typeof operationId !== "string" ||
    operationId.length < OPERATION_ID_MIN ||
    operationId.length > OPERATION_ID_MAX
  ) {
    throw new Error("Invalid operationId");
  }
}

/**
 * Load the caller's operation through its logical unique key and reject an ID
 * reused for a different save kind.
 */
export async function loadItemOperation(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  operationId: string,
  kind: OperationKind = "image",
): Promise<Doc<"itemOperations"> | null> {
  const operation = await ctx.db
    .query("itemOperations")
    .withIndex("by_user_operation", (query) =>
      query.eq("userId", userId).eq("operationId", operationId),
    )
    .unique();
  if (operation === null) return null;
  if (operation.kind !== kind) {
    throw new Error("Operation kind mismatch");
  }
  return operation;
}

/**
 * True iff neither an item nor any OTHER operation references `storageId`.
 * Attach and cleanup may delete/adopt a blob only when this passes. Checking
 * both tables closes the double-adopt hole: otherwise two operations could
 * finalize into items sharing one blob, then deletion of either item could
 * destroy storage still used by the survivor.
 *
 * Known residual: an upload that has completed but has not yet been attached
 * is referenced by no row. An authenticated caller who somehow learns another
 * user's unguessable storage ID could adopt or delete it during that narrow
 * window. Convex's direct-upload API provides no server-verifiable binding
 * between the upload URL and `(userId, operationId)`; closing this requires a
 * server-mediated upload-completion protocol. The current design accepts the
 * residual and never presents this check as proof of ownership.
 */
export async function isStorageUnreferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  excludeOperation?: Id<"itemOperations">,
): Promise<boolean> {
  const item = await ctx.db
    .query("items")
    .withIndex("by_storage", (query) => query.eq("storageId", storageId))
    .first();
  if (item !== null) return false;

  const operations = await ctx.db
    .query("itemOperations")
    .withIndex("by_storage", (query) => query.eq("storageId", storageId))
    .take(2);
  return operations.every((operation) => operation._id === excludeOperation);
}

/**
 * Delete a storage object only when it still exists. Cleanup and recycle paths
 * are transactional; one already-missing blob must not throw and repeatedly
 * wedge the oldest cleanup page.
 */
export async function safeDeleteStorage(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  const exists = await ctx.db.system.get("_storage", storageId);
  if (exists !== null) {
    await ctx.storage.delete(storageId);
  }
}
