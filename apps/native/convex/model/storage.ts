import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Storage deletion throws when the blob is already missing; cleanup sweeps
// tolerate stale references instead of getting wedged on them.
export async function safeDeleteStorage(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<void> {
  const exists = await ctx.db.system.get("_storage", storageId);
  if (exists !== null) {
    await ctx.storage.delete(storageId);
  }
}
