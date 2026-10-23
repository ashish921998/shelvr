import { v } from "convex/values";
import {} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { beginProcessingRun } from "./items";
import { authedMutation } from "./model/auth";
import { demoError, MAX_DEMO_RETRIES } from "./model/demoErrors";
import { isUrlPolicyError, normalizeExternalUrl } from "./model/externalUrl";
import { isTerminalFailure, MAX_ITEM_TITLE_CHARS } from "./model/itemFields";
import { emptySummary, insertMembership } from "./model/memberships";
import { validateSpaceName } from "./model/spaceName";
import { rateLimiter } from "./model/rateLimiter";

const demoStatusValidator = v.union(
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

function validateDestination(
  spaceName: string | undefined,
): string | undefined {
  if (spaceName === undefined) return undefined;
  try {
    return validateSpaceName(spaceName);
  } catch {
    throw demoError("invalid_space_name");
  }
}

async function findOrCreateDynamicSpace(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
): Promise<Id<"spaces">> {
  const existing = await ctx.db
    .query("spaces")
    .withIndex("by_user_and_name", (q) =>
      q.eq("userId", userId).eq("name", name),
    )
    .first();
  if (existing !== null) {
    return existing._id;
  }
  return await ctx.db.insert("spaces", {
    userId,
    name,
    dynamic: true,
    ...emptySummary(),
  });
}

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

/** The one link save a user gets without Pro; a repeat returns that item with `reused: true`. */
export const createDemoItem = authedMutation({
  args: {
    url: v.string(),
    spaceName: v.optional(v.string()),
    analyticsSessionId: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  returns: v.object({
    itemId: v.id("items"),
    userId: v.string(),
    url: v.string(),
    urlMatchesRequest: v.boolean(),
    reused: v.boolean(),
    savedSpaceNames: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const existing = await ctx.db
      .query("onboardingDemos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing !== null) {
      const item = await ctx.db.get(existing.itemId);
      if (item === null || item.userId !== userId || !item.url) {
        throw demoError("demo_used");
      }
      let urlMatchesRequest = false;
      try {
        urlMatchesRequest = normalizeExternalUrl(args.url) === item.url;
      } catch (error) {
        if (!isUrlPolicyError(error)) throw error;
      }
      return {
        itemId: existing.itemId,
        userId,
        url: item.url,
        urlMatchesRequest,
        reused: true,
        savedSpaceNames: await savedSpaceNames(ctx, existing.itemId),
      };
    }

    const url = normalizeExternalUrl(args.url);
    const destination = validateDestination(args.spaceName);

    await rateLimiter.limit(ctx, "itemCreate", { key: userId, throws: true });

    const run = beginProcessingRun();
    const title = args.title?.trim() ?? "";
    const keptTitle =
      title !== "" && title.length <= MAX_ITEM_TITLE_CHARS
        ? { title, titleSource: "user" as const }
        : {};
    const itemId = await ctx.db.insert("items", {
      userId,
      type: "link",
      ...run,
      ...keptTitle,
      url,
      tags: [],
      searchText: "",
    });
    if (destination !== undefined) {
      const spaceId = await findOrCreateDynamicSpace(ctx, userId, destination);
      await insertMembership(ctx, { userId, spaceId, itemId, status: "saved" });
    }
    // Convex has no unique indexes: OCC retries a racing call, which then finds this row.
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
      saveSource: "onboarding_demo",
    });
    return {
      itemId,
      userId,
      url,
      urlMatchesRequest: true,
      reused: false,
      savedSpaceNames: destination !== undefined ? [destination] : [],
    };
  },
});

export const retryDemoItem = authedMutation({
  args: {},
  returns: v.object({
    scheduled: v.boolean(),
    status: demoStatusValidator,
  }),
  handler: async (ctx) => {
    const { userId } = ctx;
    const demo = await ctx.db
      .query("onboardingDemos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (demo === null) {
      throw demoError("no_demo");
    }
    const item = await ctx.db.get(demo.itemId);
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
