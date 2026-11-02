import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authedQuery } from "./model/auth";
import { logEvent } from "./model/log";
import { saveError } from "./model/saveErrors";
import { hasProEntitlement, hasProEntitlementAt } from "./subscriptions";

export const FREE_SAVE_LIMIT = 10;

export function freeSavesEnabled(): boolean {
  return env.FREE_SAVES_ENABLED === "true";
}

async function heldFreeSaves(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<number> {
  let held = 0;
  for (const status of ["pending", "placed"] as const) {
    const rows = await ctx.db
      .query("freeSaves")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", status),
      )
      .take(FREE_SAVE_LIMIT);
    held += rows.length;
  }
  return held;
}

export async function claimSave(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  if (await hasProEntitlement(ctx, userId)) return false;
  if (!freeSavesEnabled()) throw saveError("pro_required");
  if ((await heldFreeSaves(ctx, userId)) >= FREE_SAVE_LIMIT) {
    logEvent("info", "free_saves_exhausted_refusal", {});
    throw saveError("pro_required");
  }
  return true;
}

export async function recordFreeSave(
  ctx: MutationCtx,
  userId: string,
  itemId: Id<"items">,
): Promise<void> {
  await ctx.db.insert("freeSaves", { userId, itemId, status: "pending" });
}

export async function isFreeSave(
  ctx: QueryCtx | MutationCtx,
  itemId: Id<"items">,
): Promise<boolean> {
  const row = await ctx.db
    .query("freeSaves")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .unique();
  return row !== null;
}

export async function reclaimFreeSave(
  ctx: MutationCtx,
  userId: Id<"users">,
  itemId: Id<"items">,
): Promise<void> {
  const row = await ctx.db
    .query("freeSaves")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .unique();
  if (row === null || row.status !== "released") return;
  if (await claimSave(ctx, userId)) {
    await ctx.db.patch(row._id, { status: "pending" });
  }
}

export async function settleFreeSave(
  ctx: MutationCtx,
  itemId: Id<"items">,
): Promise<void> {
  const row = await ctx.db
    .query("freeSaves")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .unique();
  if (row === null || row.status !== "pending") return;
  const item = await ctx.db.get(itemId);
  const placed =
    item !== null && item.status === "ready" && (item.cities?.length ?? 0) > 0;
  const status = placed
    ? "placed"
    : item === null || item.status !== "processing"
      ? "released"
      : "pending";
  if (status !== row.status) await ctx.db.patch(row._id, { status });
}

export const getFreeSaves = authedQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ limit: v.number(), used: v.number(), left: v.number() }),
  ),
  handler: async (ctx) => {
    const { userId } = ctx;
    if (!freeSavesEnabled()) return null;
    if (await hasProEntitlementAt(ctx, userId, Date.now())) return null;
    const used = await heldFreeSaves(ctx, userId);
    return {
      limit: FREE_SAVE_LIMIT,
      used,
      left: Math.max(0, FREE_SAVE_LIMIT - used),
    };
  },
});
