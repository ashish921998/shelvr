import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./model/auth";
import { MAX_PLACE_NAME_CHARS, placeKey } from "./model/plan";
import {
  barePlaceKey,
  closestUnidentifiedSpot,
  findVisit,
  MAX_VISIT_SPOTS,
  knowsSpot,
  matchesVisitSpot,
  namedVisitMarkValidator,
  rowSpots,
  spotsOnItem,
  userVisits,
  visitRows,
  visitRowsWithNamePrefix,
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
    spots?.[0] !== undefined &&
    knowsSpot(oldSpots, spots[0]);
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

type ClearRow = {
  row: Doc<"placeVisits">;
  sameName: boolean;
  relatedName: boolean;
  original: VisitSpot[] | undefined;
  remaining: VisitSpot[] | undefined;
};

function clearSpot(rows: ClearRow[], spot: VisitSpot): void {
  let matched = false;
  for (const entry of rows) {
    const matches = (kept: VisitSpot) =>
      matchesVisitSpot(kept, spot, entry.relatedName);
    if (entry.original?.some(matches)) {
      entry.remaining = entry.remaining?.filter((kept) => !matches(kept));
      matched = true;
    }
  }
  if (matched) return;
  const named = rows.find((entry) => entry.sameName);
  if (named?.remaining === undefined) return;
  const nearest = closestUnidentifiedSpot(named.remaining, spot);
  if (nearest !== undefined) {
    named.remaining = named.remaining.filter((kept) => kept !== nearest);
  }
}

async function clearVisit(
  ctx: MutationCtx,
  clear: {
    userId: Id<"users">;
    name: string;
    key: string;
    existing: Doc<"placeVisits"> | null;
    spots: VisitSpot[] | undefined;
  },
): Promise<void> {
  const { userId, name, key, existing, spots } = clear;
  if (spots === undefined) {
    if (existing !== null && (await rowSpots(ctx, existing)) === undefined) {
      await ctx.db.delete(existing._id);
    }
    return;
  }
  const bare = barePlaceKey(name);
  const byId = spots.some((spot) => spot.appleId !== undefined);
  const candidates = byId
    ? await visitRows(ctx, userId)
    : await visitRowsWithNamePrefix(ctx, userId, bare);
  if (
    existing !== null &&
    !candidates.some((row) => row._id === existing._id)
  ) {
    candidates.push(existing);
  }
  const rows = await Promise.all(
    candidates.map(async (row): Promise<ClearRow> => {
      const sameName = row.key === key;
      const relatedName =
        sameName || (bare !== "" && barePlaceKey(row.name) === bare);
      const original =
        byId || relatedName ? await rowSpots(ctx, row) : undefined;
      return { row, sameName, relatedName, original, remaining: original };
    }),
  );
  for (const spot of spots) clearSpot(rows, spot);
  for (const { row, sameName, original, remaining } of rows) {
    if (remaining?.length === 0 || (original === undefined && sameName)) {
      await ctx.db.delete(row._id);
    } else if (remaining !== original) {
      await ctx.db.patch(row._id, { spots: remaining });
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
    const spots =
      args.spot === undefined
        ? spotsOnItem(item, args.name)
        : [tidySpot(args.spot)];
    const existing = await findVisit(ctx, userId, args.name);
    if (!args.visited) {
      await rateLimiter.limit(ctx, "placeVisitClear", {
        key: userId,
        throws: true,
      });
      await clearVisit(ctx, { userId, name: args.name, key, existing, spots });
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
  returns: v.array(namedVisitMarkValidator),
  handler: async (ctx) => await userVisits(ctx, ctx.userId),
});
