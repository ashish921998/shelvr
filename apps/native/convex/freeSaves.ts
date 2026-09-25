import { v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./model/auth";
import { FREE_SAVE_LIMIT, freeSavesRemaining } from "./model/freeSaves";
import { saveError } from "./model/saveErrors";
import { hasProEntitlement } from "./subscriptions";

/**
 * The caller's free save allowance. The client combines it with
 * `getEntitlement`: a user without Pro can save while `remaining` is above
 * zero. Advisory like `getEntitlement`; the save mutations re-check it.
 */
export const getSaveAllowance = query({
  args: {},
  returns: v.object({
    limit: v.number(),
    used: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const used = (await usageFor(ctx, userId))?.used ?? 0;
    return {
      limit: FREE_SAVE_LIMIT,
      used,
      remaining: freeSavesRemaining(used),
    };
  },
});

async function usageFor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"freeSaveUsage"> | null> {
  return await ctx.db
    .query("freeSaveUsage")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * The save gate: passes with Pro, or without it while the free allowance has
 * room. Throws {@link saveError}`("pro_required")` otherwise, which the client
 * decodes to open the paywall. Checks only; the allowance is spent by
 * {@link spendSaveAllowance} once an item is actually created, so idempotent
 * retries and multi-step image imports are charged once.
 */
export async function requireSaveAllowance(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  if (await hasProEntitlement(ctx, userId)) return;
  const used = (await usageFor(ctx, userId))?.used ?? 0;
  if (freeSavesRemaining(used) === 0) throw saveError("pro_required");
}

/**
 * Charges one free save for an item about to be created. A no-op with Pro.
 * Throws `pro_required` when the allowance is spent, so a racing second save
 * at the limit is rejected before its insert (Convex OCC serializes the two).
 */
export async function spendSaveAllowance(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  if (await hasProEntitlement(ctx, userId)) return;
  const usage = await usageFor(ctx, userId);
  const used = usage?.used ?? 0;
  if (freeSavesRemaining(used) === 0) throw saveError("pro_required");
  if (usage === null) {
    await ctx.db.insert("freeSaveUsage", {
      userId,
      used: 1,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.patch(usage._id, { used: used + 1, updatedAt: Date.now() });
  }
}
