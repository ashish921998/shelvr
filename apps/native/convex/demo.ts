import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { beginProcessingRun } from "./items";
import { requireUserId } from "./model/auth";
import { demoError } from "./model/demoErrors";
import { normalizeExternalUrl } from "./model/externalUrl";
import { isTerminalFailure } from "./model/itemFields";
import { insertMembership } from "./model/memberships";
import { MAX_SPACE_NAME_LENGTH } from "./model/spaceName";
import { rateLimiter } from "./model/rateLimiter";

// User-facing failures are thrown via `demoError(code)` (model/demoErrors.ts):
// a ConvexError with structured data the client branches on. A plain Error's
// message is redacted to "Server Error" in production.

/** Total retry cap for the demo item, on top of the demoRetry rate limiter's cooldown. */
export const MAX_DEMO_RETRIES = 5;

const demoStatusValidator = v.union(
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

/** The optional space the user picked for this link; omitted means "just my shelf". */
function validateDestination(spaceName: string | undefined): string | undefined {
  if (spaceName === undefined) return undefined;
  const name = spaceName.trim();
  if (name === "" || name.length > MAX_SPACE_NAME_LENGTH) {
    throw demoError("invalid_space_name");
  }
  return name;
}

/** Same idempotency key as createSpace (trimmed name), but not Pro-gated and
 * created dynamic so the classifier can keep suggesting into it. */
async function findOrCreateDynamicSpace(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
): Promise<Id<"spaces">> {
  const existing = await ctx.db
    .query("spaces")
    .withIndex("by_user_and_name", (q) => q.eq("userId", userId).eq("name", name))
    .first();
  if (existing !== null) {
    return existing._id;
  }
  return await ctx.db.insert("spaces", {
    userId,
    name,
    dynamic: true,
    // Born with an exact (empty) summary, like createSpace, so it never takes
    // the legacy scan path in listSpaces.
    savedCount: 0,
    suggestedCount: 0,
    previewItemIds: [],
    suggestedPreviewItemIds: [],
  });
}

/** Names of the caller's spaces this item is explicitly saved into. */
async function savedSpaceNames(
  ctx: QueryCtx,
  itemId: Id<"items">,
): Promise<string[]> {
  const joins = await ctx.db
    .query("spaceItems")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .collect();
  const names: string[] = [];
  for (const join of joins) {
    if (join.status !== "saved") continue;
    const space = await ctx.db.get(join.spaceId);
    if (space !== null) names.push(space.name);
  }
  return names;
}

/**
 * The pre-payment onboarding demo: ONE real link save per authenticated user
 * without Pro. The only exception to the `requireProEntitlement` gates on the
 * regular create mutations.
 *
 *  - Idempotent: a repeat (retry, double-tap, different URL) returns the same
 *    itemId with `reused: true` and never schedules a second `processItem`.
 *    Deleting the item does not reset the allowance (`demo_used`).
 *  - Race-safe: the (empty index read + insert) pair relies on Convex's
 *    serializable OCC, same idiom as operation ids in `items.ts`.
 *  - `spaceName` is the user's explicit pick and becomes a `saved` membership;
 *    classification may only add `suggested` rows afterwards.
 */
export const createDemoItem = mutation({
  args: {
    url: v.string(),
    spaceName: v.optional(v.string()),
    analyticsSessionId: v.optional(v.string()),
  },
  returns: v.object({
    itemId: v.id("items"),
    url: v.string(),
    reused: v.boolean(),
    savedSpaceNames: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const existing = await ctx.db
      .query("onboardingDemos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing !== null) {
      // Return the original save (its URL, its current destinations), never
      // the newly typed input.
      const item = await ctx.db.get(existing.itemId);
      if (item === null || item.userId !== userId || !item.url) {
        throw demoError("demo_used");
      }
      return {
        itemId: existing.itemId,
        url: item.url,
        reused: true,
        savedSpaceNames: await savedSpaceNames(ctx, existing.itemId),
      };
    }

    // Validate before any write so an invalid request consumes no allowance.
    const url = normalizeExternalUrl(args.url);
    const destination = validateDestination(args.spaceName);

    // Limit after the idempotent return so a retry is never billed a token.
    await rateLimiter.limit(ctx, "itemCreate", { key: userId, throws: true });

    // Same run stamp as every other save, so finalizeItem/failItem fence this
    // run and the stale sweeper measures from now rather than creation.
    const run = beginProcessingRun();
    const itemId = await ctx.db.insert("items", {
      userId,
      type: "link",
      ...run,
      url,
      tags: [],
      searchText: "",
    });
    if (destination !== undefined) {
      const spaceId = await findOrCreateDynamicSpace(ctx, userId, destination);
      // Through the helper so the space's saved count and preview stay exact.
      await insertMembership(ctx, { userId, spaceId, itemId, status: "saved" });
    }
    await ctx.db.insert("onboardingDemos", {
      userId,
      itemId,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.ai.processItem, {
      itemId,
      runId: run.processingRunId,
    });
    const item = await ctx.db.get(itemId);
    await ctx.scheduler.runAfter(0, internal.analytics.captureSave, {
      itemId,
      userId,
      itemType: "link",
      savedAt: item?._creationTime ?? Date.now(),
      sessionId: args.analyticsSessionId?.slice(0, 128),
    });
    return {
      itemId,
      url,
      reused: false,
      savedSpaceNames: destination !== undefined ? [destination] : [],
    };
  },
});

/**
 * Retry for a failed demo classification, so a transient fetch/LLM error
 * cannot lock a non-entitled user out (reprocessItem is Pro-gated). Re-runs the
 * pipeline on the same item; only a `failed` item is rescheduled. Bounded by
 * the `demoRetry` rate limiter (cooldown) and `retryCount` (total cap).
 *
 * Same gate as `reprocessItem`: a terminal failure (the page is gone) is
 * refused outright — it would spend a classification without changing the
 * result — and consumes neither the retry cap nor the rate-limit bucket.
 */
export const retryDemoItem = mutation({
  args: {},
  returns: v.object({
    scheduled: v.boolean(),
    status: demoStatusValidator,
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const demo = await ctx.db
      .query("onboardingDemos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (demo === null) {
      throw demoError("no_demo");
    }
    const item = await ctx.db.get(demo.itemId);
    // Defense-in-depth ownership check on the item row itself.
    if (item === null || item.userId !== userId) {
      throw demoError("demo_used");
    }
    if (item.status !== "failed") {
      return { scheduled: false, status: item.status };
    }
    if (isTerminalFailure(item.failureReason)) {
      throw demoError("terminal_failure");
    }
    if ((demo.retryCount ?? 0) >= MAX_DEMO_RETRIES) {
      throw demoError("too_many_retries");
    }
    await rateLimiter.limit(ctx, "demoRetry", { key: userId, throws: true });
    await ctx.db.patch(demo._id, {
      retryCount: (demo.retryCount ?? 0) + 1,
    });
    // A fresh run id: the previous run, if it is somehow still alive, can no
    // longer write over this retry's result.
    const run = beginProcessingRun();
    await ctx.db.patch(item._id, {
      ...run,
      failureReason: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.ai.processItem, {
      itemId: item._id,
      runId: run.processingRunId,
    });
    return { scheduled: true, status: "processing" as const };
  },
});
