import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./model/auth";
import { MAX_PLACE_NAME_CHARS, placeKey } from "./model/plan";
import {
  findVisit,
  MAX_VISIT_SPOTS,
  knowsSpot,
  rowSpots,
  spotsToClear,
  spotsOnItem,
  userVisits,
  visitRows,
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
    spots: VisitSpot[] | undefined;
    explicit: boolean;
  },
): Promise<void> {
  const { userId, key, existing, visit, spots, explicit } = mark;
  const oldSpots =
    existing === null ? undefined : await rowSpots(ctx, existing);
  const narrowing =
    explicit &&
    existing?.spots === undefined &&
    oldSpots !== undefined &&
    oldSpots.length > 1 &&
    (existing?.itemId === visit.itemId ||
      (spots?.[0] !== undefined && knowsSpot(oldSpots, spots[0])));
  const next = narrowing ? [] : [...(oldSpots ?? [])];
  for (const spot of spots ?? []) {
    if (!knowsSpot(next, spot)) next.push(spot);
  }
  if (spots !== undefined && next.length > MAX_VISIT_SPOTS) {
    throw new Error("Place has too many visited spots");
  }
  if (existing === null) {
    await ctx.db.insert("placeVisits", {
      userId,
      key,
      ...visit,
      ...(spots === undefined ? {} : { spots: next }),
    });
    return;
  }
  if (spots === undefined) {
    await ctx.db.patch(existing._id, {
      name: visit.name,
      visitedAt: visit.visitedAt,
    });
    return;
  }
  await ctx.db.patch(existing._id, { ...visit, spots: next });
}

async function visitsAt(
  ctx: MutationCtx,
  userId: Id<"users">,
  existing: Doc<"placeVisits"> | null,
  spot: VisitSpot,
): Promise<Doc<"placeVisits">[]> {
  if (spot.appleId !== undefined) return await visitRows(ctx, userId);
  const row = existing === null ? null : await ctx.db.get(existing._id);
  return row === null ? [] : [row];
}

async function clearSpot(
  ctx: MutationCtx,
  clear: {
    userId: Id<"users">;
    key: string;
    existing: Doc<"placeVisits"> | null;
    spot: VisitSpot;
  },
): Promise<void> {
  const { userId, key, existing, spot } = clear;
  for (const row of await visitsAt(ctx, userId, existing, spot)) {
    const sameName = row.key === key;
    const kept = await rowSpots(ctx, row);
    if (kept === undefined) {
      if (sameName) await ctx.db.delete(row._id);
      continue;
    }
    const gone = spotsToClear(kept, spot, sameName);
    const spots = kept.filter((spotKept) => !gone.includes(spotKept));
    if (spots.length === 0) {
      await ctx.db.delete(row._id);
    } else if (gone.length > 0) {
      await ctx.db.patch(row._id, { spots });
    }
  }
}

async function clearVisit(
  ctx: MutationCtx,
  clear: {
    userId: Id<"users">;
    key: string;
    existing: Doc<"placeVisits"> | null;
    spots: VisitSpot[] | undefined;
  },
): Promise<void> {
  const { existing, spots } = clear;
  if (spots === undefined) {
    if (existing !== null && (await rowSpots(ctx, existing)) === undefined) {
      await ctx.db.delete(existing._id);
    }
    return;
  }
  for (const spot of spots) await clearSpot(ctx, { ...clear, spot });
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
    const spots =
      args.spot === undefined ? spotsOnItem(item, key) : [tidySpot(args.spot)];
    const existing = await findVisit(ctx, userId, args.name);
    if (!args.visited) {
      await rateLimiter.limit(ctx, "placeVisitClear", {
        key: userId,
        throws: true,
      });
      await clearVisit(ctx, { userId, key, existing, spots });
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
    await markVisit(ctx, {
      userId,
      key,
      existing,
      visit,
      spots,
      explicit: args.spot !== undefined,
    });
    return null;
  },
});

export const listVisits = authedQuery({
  args: {},
  returns: v.array(visitMarkValidator),
  handler: async (ctx) =>
    (await userVisits(ctx, ctx.userId)).map(({ key, spots }) =>
      spots === undefined ? { key } : { key, spots },
    ),
});
