import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./model/auth";
import { MAX_PLACE_NAME_CHARS, placeKey } from "./model/plan";
import {
  findVisit,
  MAX_VISIT_SPOTS,
  spotMarks,
  userVisits,
  visitMarkValidator,
  type VisitSpot,
  visitSpotValidator,
} from "./model/placeVisits";
import { rateLimiter } from "./model/rateLimiter";
import { MAX_APPLE_ID_CHARS, tidyText, validPoint } from "./model/tripPlace";
import { requireProEntitlement } from "./subscriptions";

type Visit = { name: string; itemId: Id<"items">; visitedAt: number };

function tidySpot(spot: VisitSpot): VisitSpot {
  if (!validPoint(spot.lat, spot.lng)) {
    throw new Error("Place position is invalid");
  }
  const appleId = tidyText(spot.appleId, MAX_APPLE_ID_CHARS);
  return {
    lat: spot.lat,
    lng: spot.lng,
    ...(appleId === undefined ? {} : { appleId }),
  };
}

async function markVisit(
  ctx: MutationCtx,
  mark: {
    userId: Id<"users">;
    key: string;
    existing: Doc<"placeVisits"> | null;
    visit: Visit;
    spot: VisitSpot | undefined;
  },
): Promise<void> {
  const { userId, key, existing, visit, spot } = mark;
  if (existing === null) {
    await ctx.db.insert("placeVisits", {
      userId,
      key,
      ...visit,
      ...(spot === undefined ? {} : { spots: [spot] }),
    });
    return;
  }
  if (existing.spots === undefined || spot === undefined) {
    await ctx.db.patch(existing._id, visit);
    return;
  }
  const known = existing.spots.some((kept) => spotMarks(kept, spot, true));
  await ctx.db.patch(existing._id, {
    ...visit,
    ...(known
      ? {}
      : { spots: [...existing.spots, spot].slice(-MAX_VISIT_SPOTS) }),
  });
}

async function visitsAt(
  ctx: MutationCtx,
  userId: Id<"users">,
  existing: Doc<"placeVisits"> | null,
  spot: VisitSpot,
): Promise<Doc<"placeVisits">[]> {
  if (spot.appleId !== undefined) {
    return await ctx.db
      .query("placeVisits")
      .withIndex("by_user_and_key", (q) => q.eq("userId", userId))
      .collect();
  }
  return existing === null ? [] : [existing];
}

async function clearVisit(
  ctx: MutationCtx,
  clear: {
    userId: Id<"users">;
    key: string;
    existing: Doc<"placeVisits"> | null;
    spot: VisitSpot | undefined;
  },
): Promise<void> {
  const { userId, key, existing, spot } = clear;
  if (spot === undefined) {
    if (existing !== null) await ctx.db.delete(existing._id);
    return;
  }
  for (const row of await visitsAt(ctx, userId, existing, spot)) {
    const sameName = row.key === key;
    if (row.spots === undefined) {
      if (sameName) await ctx.db.delete(row._id);
      continue;
    }
    const spots = row.spots.filter((kept) => !spotMarks(kept, spot, sameName));
    if (spots.length === 0) {
      await ctx.db.delete(row._id);
    } else if (spots.length < row.spots.length) {
      await ctx.db.patch(row._id, { spots });
    }
  }
}

export const setVisited = authedMutation({
  args: {
    itemId: v.id("items"),
    name: v.string(),
    visited: v.boolean(),
    spot: v.optional(visitSpotValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found");
    }
    const key = placeKey(args.name);
    if (key === "") {
      throw new Error("Place name is empty");
    }
    const spot = args.spot === undefined ? undefined : tidySpot(args.spot);
    const existing = await findVisit(ctx, userId, args.name);
    if (!args.visited) {
      await clearVisit(ctx, { userId, key, existing, spot });
      return null;
    }
    await requireProEntitlement(ctx, userId);
    await rateLimiter.limit(ctx, "placeVisit", { key: userId, throws: true });
    const visit = {
      name: args.name
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_PLACE_NAME_CHARS),
      itemId: args.itemId,
      visitedAt: Date.now(),
    };
    await markVisit(ctx, { userId, key, existing, visit, spot });
    return null;
  },
});

export const listVisits = authedQuery({
  args: {},
  returns: v.array(visitMarkValidator),
  handler: async (ctx) => await userVisits(ctx, ctx.userId),
});
