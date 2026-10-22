import { v } from "convex/values";
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
import { aiAllowed } from "./aiConsent";
import { planSourceValidator } from "./model/plan";
import { RECOMMEND_CANDIDATES } from "./model/embedding";
import { validateSpaceDescription, validateSpaceName } from "./model/spaceName";
import { hasProEntitlement, requireProEntitlement } from "./subscriptions";
import { rateLimiter } from "./model/rateLimiter";
import {
  deleteMembershipsForSpace,
  effectiveStatus,
  getMembership,
  hasSummary,
  insertMembership,
  PREVIEW_LIMIT,
  setMembershipStatus,
  SUMMARY_SCAN_LIMIT,
  summarizeMemberships,
  toSummaryPatch,
  type MembershipSummary,
} from "./model/memberships";
import { enrichItem, enrichedItemValidator, intentValidator } from "./items";
import { deletePlanSharesForSpace } from "./planShares";
import {
  beenPlaces,
  claimSpaceForModel,
  deleteTripsForSpace,
  loadReadySaves,
  toPlanSource,
} from "./tripData";

const spaceFields = {
  _id: v.id("spaces"),
  _creationTime: v.number(),
  userId: v.string(),
  fixtureKey: v.optional(v.string()),
  name: v.string(),
  description: v.optional(v.string()),
  dynamic: v.optional(v.boolean()),
  autoFile: v.optional(v.boolean()),
  autoFileSince: v.optional(v.number()),
  savedCount: v.optional(v.number()),
  suggestedCount: v.optional(v.number()),
  previewItemIds: v.optional(v.array(v.id("items"))),
  suggestedPreviewItemIds: v.optional(v.array(v.id("items"))),
};

const SPACE_DELETE_BATCH = 500;

const BACKFILL_BATCH = 10;
const BACKFILL_SCAN_LIMIT = 8000;
const BACKFILL_READ_BUDGET = BACKFILL_SCAN_LIMIT + 1;

function knob(
  value: number | undefined,
  min: number,
  fallback: number,
): number {
  return value !== undefined && Number.isFinite(value) && value >= min
    ? Math.floor(value)
    : fallback;
}

async function splitJoins(ctx: QueryCtx, spaceId: Id<"spaces">) {
  const joins = await ctx.db
    .query("spaceItems")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .collect();
  const saved: Doc<"spaceItems">[] = [];
  const suggested: Doc<"spaceItems">[] = [];
  for (const join of joins) {
    const status = effectiveStatus(join);
    if (status === "saved") {
      saved.push(join);
    } else if (status === "suggested") {
      suggested.push(join);
    }
  }
  return { saved, suggested };
}

async function loadItems(
  ctx: QueryCtx,
  joins: Doc<"spaceItems">[],
): Promise<Doc<"items">[]> {
  const items: Doc<"items">[] = [];
  for (const join of joins) {
    const item = await ctx.db.get(join.itemId);
    if (item !== null) {
      items.push(item);
    }
  }
  items.sort((a, b) => b._creationTime - a._creationTime);
  return items;
}

async function readSummary(
  ctx: QueryCtx,
  space: Doc<"spaces">,
): Promise<MembershipSummary> {
  if (hasSummary(space)) {
    return toSummaryPatch(space);
  }
  return await summarizeMemberships(ctx, space._id, SUMMARY_SCAN_LIMIT);
}

type Preview = {
  url: string;
  type: Doc<"items">["type"];
  aspectRatio?: number;
  suggested: boolean;
};

async function loadPreviews(
  ctx: QueryCtx,
  summary: MembershipSummary,
): Promise<Preview[]> {
  const candidates = [
    ...summary.previewItemIds.map((id) => ({ id, suggested: false })),
    ...summary.suggestedPreviewItemIds.map((id) => ({ id, suggested: true })),
  ];
  const previews: Preview[] = [];
  for (const { id, suggested } of candidates) {
    if (previews.length >= PREVIEW_LIMIT) {
      break;
    }
    const item = await ctx.db.get(id);
    if (item === null) {
      continue;
    }
    if (item.storageId) {
      const url = await ctx.storage.getUrl(item.storageId);
      if (url !== null) {
        previews.push({
          url,
          type: item.type,
          aspectRatio: item.aspectRatio,
          suggested,
        });
      }
    }
  }
  return previews;
}

export const listSpaces = query({
  args: {},
  returns: v.array(
    v.object({
      ...spaceFields,
      itemCount: v.number(),
      suggestionCount: v.number(),
      previews: v.array(
        v.object({
          url: v.string(),
          type: v.union(
            v.literal("image"),
            v.literal("link"),
            v.literal("note"),
          ),
          aspectRatio: v.optional(v.number()),
          suggested: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const spaces = await ctx.db
      .query("spaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const results = [];
    for (const space of spaces) {
      const summary = await readSummary(ctx, space);
      results.push({
        ...space,
        itemCount: summary.savedCount,
        suggestionCount: summary.suggestedCount,
        previews: await loadPreviews(ctx, summary),
      });
    }
    return results;
  },
});

export const getSpace = query({
  args: { id: v.id("spaces") },
  returns: v.union(
    v.object({
      ...spaceFields,
      items: v.array(
        v.object({
          ...enrichedItemValidator.fields,
          spaceIntents: v.optional(v.array(intentValidator)),
        }),
      ),
      suggestions: v.array(enrichedItemValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.id);
    if (space === null || space.userId !== userId) {
      return null;
    }
    const { saved, suggested } = await splitJoins(ctx, space._id);
    const intentsByItem = new Map(
      saved.map((join) => [join.itemId, join.intents]),
    );
    const [items, suggestions] = await Promise.all([
      loadItems(ctx, saved).then((rows) =>
        Promise.all(
          rows.map(async (item) => ({
            ...(await enrichItem(ctx, item)),
            spaceIntents: intentsByItem.get(item._id),
          })),
        ),
      ),
      loadItems(ctx, suggested).then((rows) =>
        Promise.all(rows.map((item) => enrichItem(ctx, item))),
      ),
    ]);
    return { ...space, items, suggestions };
  },
});

export const createSpace = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    dynamic: v.optional(v.boolean()),
    autoFile: v.optional(v.boolean()),
  },
  returns: v.id("spaces"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = args.name.trim();

    const existing = await ctx.db
      .query("spaces")
      .withIndex("by_user_and_name", (q) =>
        q.eq("userId", userId).eq("name", name),
      )
      .take(1);
    if (existing.length > 0) {
      return existing[0]._id;
    }
    validateSpaceName(name);
    const description = validateSpaceDescription(args.description);

    await requireProEntitlement(ctx, userId);
    await rateLimiter.limit(ctx, "recommendSpace", {
      key: userId,
      throws: true,
    });
    const spaceId = await ctx.db.insert("spaces", {
      userId,
      name,
      description,
      dynamic: args.dynamic ?? false,
      ...(args.dynamic === true && args.autoFile === true
        ? { autoFile: true, autoFileSince: Date.now() }
        : { autoFile: false }),
      savedCount: 0,
      suggestedCount: 0,
      previewItemIds: [],
      suggestedPreviewItemIds: [],
    });
    await ctx.scheduler.runAfter(
      0,
      internal.aiRecommendForSpace.recommendForSpace,
      {
        spaceId,
      },
    );
    return spaceId;
  },
});

export const updateSpace = mutation({
  args: {
    id: v.id("spaces"),
    name: v.optional(v.string()),
    dynamic: v.optional(v.boolean()),
    autoFile: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.id);
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    const wasDynamic = space.dynamic === true;
    const enablingDynamic = args.dynamic === true && !wasDynamic;
    const nextDynamic = args.dynamic ?? wasDynamic;
    const nextAutoFile =
      nextDynamic && (args.autoFile ?? space.autoFile === true);
    const enablingAutoFile = nextAutoFile && space.autoFile !== true;
    if (enablingDynamic) {
      await requireProEntitlement(ctx, userId);
      await rateLimiter.limit(ctx, "recommendSpace", {
        key: userId,
        throws: true,
      });
    } else if (enablingAutoFile) {
      await requireProEntitlement(ctx, userId);
    }
    const patch: {
      name?: string;
      dynamic?: boolean;
      autoFile?: boolean;
      autoFileSince?: number;
    } = {};
    if (args.name !== undefined && args.name.trim() !== space.name) {
      patch.name = validateSpaceName(args.name);
    }
    if (args.dynamic !== undefined) {
      patch.dynamic = args.dynamic;
    }
    if (enablingAutoFile) {
      patch.autoFile = true;
      patch.autoFileSince = Date.now();
    } else if (!nextAutoFile && space.autoFile === true) {
      patch.autoFile = false;
      patch.autoFileSince = undefined;
    }
    await ctx.db.patch(space._id, patch);
    if (enablingDynamic) {
      await ctx.scheduler.runAfter(
        0,
        internal.aiRecommendForSpace.recommendForSpace,
        {
          spaceId: space._id,
        },
      );
    }
    return null;
  },
});

export const deleteSpace = mutation({
  args: { id: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.id);
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    await ctx.db.delete(space._id);
    await deleteTripsForSpace(ctx, space._id);
    const more = await deleteSpaceRemains(ctx, space._id);
    if (more) {
      await ctx.scheduler.runAfter(0, internal.spaces.purgeSpaceMemberships, {
        spaceId: space._id,
      });
    }
    return null;
  },
});

async function deleteSpaceRemains(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
): Promise<boolean> {
  const moreJoins = await deleteMembershipsForSpace(
    ctx,
    spaceId,
    SPACE_DELETE_BATCH,
  );
  const sharesDone = await deletePlanSharesForSpace(ctx, spaceId);
  return moreJoins || !sharesDone;
}

export const purgeSpaceMemberships = internalMutation({
  args: { spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const more = await deleteSpaceRemains(ctx, args.spaceId);
    if (more) {
      await ctx.scheduler.runAfter(0, internal.spaces.purgeSpaceMemberships, {
        spaceId: args.spaceId,
      });
    }
    return null;
  },
});

async function requireItemAndSpace(
  ctx: MutationCtx,
  userId: string,
  itemId: Id<"items">,
  spaceId: Id<"spaces">,
): Promise<{ item: Doc<"items">; space: Doc<"spaces"> }> {
  const item = await ctx.db.get(itemId);
  if (item === null || item.userId !== userId) {
    throw new Error("Item not found");
  }
  const space = await ctx.db.get(spaceId);
  if (space === null || space.userId !== userId) {
    throw new Error("Space not found");
  }
  return { item, space };
}

async function scheduleSteering(
  ctx: MutationCtx,
  userId: Id<"users">,
  item: Doc<"items">,
  spaceId: Id<"spaces">,
  options: { throws: boolean },
): Promise<boolean> {
  if (item.status !== "ready") {
    return false;
  }
  if (!(await hasProEntitlement(ctx, userId))) {
    return false;
  }
  if (!(await aiAllowed(ctx, userId))) {
    return false;
  }
  const { ok } = await rateLimiter.limit(ctx, "steerItem", {
    key: userId,
    throws: options.throws,
  });
  if (!ok) {
    return false;
  }
  await ctx.scheduler.runAfter(0, internal.ai.steerItemForSpace, {
    itemId: item._id,
    spaceId,
    budgetCharged: true,
  });
  return true;
}

export const addItemToSpace = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { item } = await requireItemAndSpace(
      ctx,
      userId,
      args.itemId,
      args.spaceId,
    );
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row === null) {
      await insertMembership(ctx, {
        userId,
        spaceId: args.spaceId,
        itemId: args.itemId,
        status: "saved",
      });
    } else if (effectiveStatus(row) !== "saved") {
      await setMembershipStatus(ctx, row, "saved");
    } else {
      return null;
    }
    await scheduleSteering(ctx, userId, item, args.spaceId, { throws: true });
    return null;
  },
});

export const removeItemFromSpace = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireItemAndSpace(ctx, userId, args.itemId, args.spaceId);
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row !== null && effectiveStatus(row) === "saved") {
      await setMembershipStatus(ctx, row, "dismissed");
    }
    return null;
  },
});

export const acceptSuggestion = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { item } = await requireItemAndSpace(
      ctx,
      userId,
      args.itemId,
      args.spaceId,
    );
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row === null || effectiveStatus(row) !== "suggested") {
      return false;
    }
    await setMembershipStatus(ctx, row, "saved");
    await scheduleSteering(ctx, userId, item, args.spaceId, { throws: true });
    return true;
  },
});

export const undoAcceptSuggestion = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireItemAndSpace(ctx, userId, args.itemId, args.spaceId);
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row !== null && effectiveStatus(row) === "saved") {
      await setMembershipStatus(ctx, row, "suggested");
      return true;
    }
    return false;
  },
});

export const dismissSuggestion = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireItemAndSpace(ctx, userId, args.itemId, args.spaceId);
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row === null || effectiveStatus(row) !== "suggested") {
      return false;
    }
    await setMembershipStatus(ctx, row, "dismissed");
    return true;
  },
});

export const acceptAllSuggestions = mutation({
  args: { spaceId: v.id("spaces") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    const { suggested } = await splitJoins(ctx, space._id);
    let steeringAllowed = true;
    for (const row of suggested) {
      await setMembershipStatus(ctx, row, "saved");
      if (!steeringAllowed) {
        continue;
      }
      const item = await ctx.db.get(row.itemId);
      if (item !== null && item.status === "ready") {
        steeringAllowed = await scheduleSteering(ctx, userId, item, space._id, {
          throws: false,
        });
      }
    }
    return suggested.length;
  },
});

export const backfillSpaceCounters = internalMutation({
  args: {
    cursor: v.optional(v.union(v.id("spaces"), v.null())),
    batchSize: v.optional(v.number()),
    readBudget: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    skipped: v.array(v.id("spaces")),
    done: v.boolean(),
    cursor: v.union(v.id("spaces"), v.null()),
  }),
  handler: async (ctx, args) => {
    const batchSize = knob(args.batchSize, 1, BACKFILL_BATCH);
    const readBudget = knob(args.readBudget, 2, BACKFILL_READ_BUDGET);
    const after = args.cursor ?? null;
    const candidates = await ctx.db
      .query("spaces")
      .withIndex("by_id", (q) => (after === null ? q : q.gt("_id", after)))
      .take(batchSize + 1);
    const batch = candidates.slice(0, batchSize);
    let moreAfterBatch = candidates.length > batchSize;

    let processed = 0;
    let updated = 0;
    let remaining = readBudget;
    let cursor: Id<"spaces"> | null = after;
    const skipped: Id<"spaces">[] = [];
    for (const space of batch) {
      if (hasSummary(space) && args.force !== true) {
        processed += 1;
        cursor = space._id;
        continue;
      }
      const first = remaining === readBudget;
      if (!first && remaining <= 1) {
        moreAfterBatch = true;
        break;
      }
      const scanLimit = Math.min(BACKFILL_SCAN_LIMIT, remaining - 1);
      const summary = await summarizeMemberships(ctx, space._id, scanLimit);
      remaining -= summary.scanned;
      if (!summary.complete && !first && scanLimit < BACKFILL_SCAN_LIMIT) {
        moreAfterBatch = true;
        break;
      }
      processed += 1;
      cursor = space._id;
      if (!summary.complete) {
        skipped.push(space._id);
        continue;
      }
      await ctx.db.patch(space._id, toSummaryPatch(summary));
      updated += 1;
    }
    const done = !moreAfterBatch;
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.spaces.backfillSpaceCounters, {
        cursor,
        batchSize,
        readBudget,
        force: args.force,
      });
    }
    return {
      processed,
      updated,
      skipped,
      done,
      cursor: done ? null : cursor,
    };
  },
});

export const listSpacesInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.array(v.object(spaceFields)),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("spaces")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getSpaceInternal = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.union(v.object(spaceFields), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.spaceId);
  },
});

export const recommendationContext = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.union(
    v.null(),
    v.object({
      space: v.object(spaceFields),
      memberIds: v.array(v.id("items")),
    }),
  ),
  handler: async (ctx, { spaceId }) => {
    const space = await ctx.db.get(spaceId);
    if (space === null || !(await aiAllowed(ctx, space.userId))) return null;
    const joins = await ctx.db
      .query("spaceItems")
      .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
      .collect();
    return { space, memberIds: joins.map((join) => join.itemId) };
  },
});

export const survivingCandidates = internalQuery({
  args: {
    userId: v.string(),
    spaceId: v.id("spaces"),
    itemIds: v.array(v.id("items")),
  },
  returns: v.union(v.null(), v.array(v.id("items"))),
  handler: async (ctx, args) => {
    if (args.itemIds.length === 0) throw new Error("No candidates");
    if (args.itemIds.length > RECOMMEND_CANDIDATES)
      throw new Error("Too many candidates");
    const space = await ctx.db.get(args.spaceId);
    if (
      space === null ||
      space.userId !== args.userId ||
      !(await aiAllowed(ctx, args.userId))
    )
      return null;
    const surviving = [];
    for (const itemId of args.itemIds) {
      const item = await ctx.db.get(itemId);
      if (
        item !== null &&
        item.userId === args.userId &&
        item.status === "ready"
      )
        surviving.push(itemId);
    }
    return surviving;
  },
});

export const claimPlanInternal = internalMutation({
  args: { spaceId: v.id("spaces") },
  returns: v.object({
    spaceName: v.string(),
    sources: v.array(planSourceValidator),
    been: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { userId, space } = await claimSpaceForModel(ctx, args.spaceId);
    const sources = (await loadReadySaves(ctx, args.spaceId, userId)).map(
      ({ item, join }) => toPlanSource(item, join),
    );
    if (sources.length === 0) {
      return { spaceName: space.name, sources, been: [] };
    }
    await rateLimiter.limit(ctx, "makePlan", {
      key: userId,
      throws: true,
    });
    return {
      spaceName: space.name,
      sources,
      been: await beenPlaces(ctx, userId),
    };
  },
});

export const listSavedSpaceIdsForItemInternal = internalQuery({
  args: { itemId: v.id("items") },
  returns: v.array(v.id("spaces")),
  handler: async (ctx, args) => {
    const joins = await ctx.db
      .query("spaceItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
    return joins
      .filter((join) => effectiveStatus(join) === "saved")
      .map((join) => join.spaceId);
  },
});

export const claimSteeringInternal = internalMutation({
  args: {
    itemId: v.id("items"),
    spaceId: v.id("spaces"),
    budgetCharged: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    const space = await ctx.db.get(args.spaceId);
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (
      !item ||
      !space ||
      item.status !== "ready" ||
      item.userId !== space.userId ||
      !row ||
      effectiveStatus(row) !== "saved"
    )
      return false;
    const userId = ctx.db.normalizeId("users", item.userId);
    if (!userId || !(await hasProEntitlement(ctx, userId))) return false;
    if (args.budgetCharged) return true;
    return (await rateLimiter.limit(ctx, "steerItem", { key: userId })).ok;
  },
});

export const setMembershipIntentsInternal = internalMutation({
  args: {
    itemId: v.id("items"),
    spaceId: v.id("spaces"),
    intents: v.array(intentValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row === null || effectiveStatus(row) !== "saved") {
      return null;
    }
    if (!(await aiAllowed(ctx, row.userId))) {
      return null;
    }
    await ctx.db.patch(row._id, { intents: args.intents });
    return null;
  },
});
