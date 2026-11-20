import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { authedQuery } from "./model/auth";
import { cuisineValidator } from "./model/itemFields";
import { logEvent } from "./model/log";
import { boxValidator, indexPlace, placesInBox } from "./model/placeIndex";
import {
  cityCentre,
  findVenue,
  inCity,
  reportValidator,
  storedPlaceValidator,
  type StoredPlace,
} from "./model/placeImport";
import { placeKinds } from "./model/placeKinds";

const MAX_SOURCES = 3;
const MAX_NAMES = 100;
const REINDEX_PAGE = 50;

export const forMap = authedQuery({
  args: { box: boxValidator },
  returns: v.array(
    v.object({
      _id: v.id("places"),
      name: v.string(),
      lat: v.number(),
      lng: v.number(),
      city: v.string(),
      appleId: v.string(),
      category: v.optional(v.string()),
      cuisine: v.optional(cuisineValidator),
      kinds: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const ids = await placesInBox(ctx, args.box);
    const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return rows.flatMap((row) =>
      row?.status === "live"
        ? [
            {
              _id: row._id,
              name: row.name,
              lat: row.lat,
              lng: row.lng,
              city: row.city,
              appleId: row.appleId,
              ...(row.category ? { category: row.category } : {}),
              ...(row.cuisine ? { cuisine: row.cuisine } : {}),
              kinds: placeKinds(row.category, [], row.cuisine),
            },
          ]
        : [],
    );
  },
});

export const store = internalMutation({
  args: {
    city: v.string(),
    places: v.array(storedPlaceValidator),
    source: v.optional(v.string()),
  },
  returns: v.object({ added: v.number(), existing: v.number() }),
  handler: async (ctx, args) => {
    let added = 0;
    let existing = 0;
    for (const place of args.places) {
      const row = await ctx.db
        .query("places")
        .withIndex("by_apple_id", (q) => q.eq("appleId", place.appleId))
        .first();
      if (row === null) {
        const fresh = {
          name: place.name,
          city: args.city,
          lat: place.lat,
          lng: place.lng,
          appleId: place.appleId,
          ...(place.category ? { category: place.category } : {}),
          ...(args.source ? { sources: [{ url: args.source }] } : {}),
          status: "live" as const,
          addedAt: Date.now(),
        };
        const _id = await ctx.db.insert("places", fresh);
        await indexPlace(ctx, { _id, ...fresh });
        added++;
        continue;
      }
      existing++;
      const sources = row.sources ?? [];
      if (
        args.source &&
        sources.length < MAX_SOURCES &&
        !sources.some((s) => s.url === args.source)
      )
        await ctx.db.patch(row._id, {
          sources: [...sources, { url: args.source }],
        });
    }
    return { added, existing };
  },
});

export const addByName = internalAction({
  args: {
    city: v.string(),
    names: v.array(v.string()),
    source: v.optional(v.string()),
  },
  returns: reportValidator,
  handler: async (ctx, args) => {
    const names = [
      ...new Set(args.names.map((name) => name.trim()).filter(Boolean)),
    ];
    if (names.length > MAX_NAMES)
      throw new Error(`at most ${MAX_NAMES} names at a time`);
    const { name: city, token, centre } = await cityCentre(args.city);
    const found: StoredPlace[] = [];
    const missed: string[] = [];
    for (const name of names) {
      const at = await findVenue(token, name, `${name}, ${city}`, centre);
      if (!at?.appleId || !inCity(at, centre)) {
        missed.push(name);
        continue;
      }
      found.push({
        name,
        lat: at.lat,
        lng: at.lng,
        appleId: at.appleId,
        ...(at.category ? { category: at.category } : {}),
      });
    }
    const stored: { added: number; existing: number } = await ctx.runMutation(
      internal.places.store,
      {
        city,
        places: found,
        ...(args.source ? { source: args.source } : {}),
      },
    );
    logEvent("info", "places_imported", { ...stored, missed: missed.length });
    return { ...stored, missed };
  },
});

export const reindexPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("places")
      .paginate({ numItems: REINDEX_PAGE, cursor: args.cursor });
    for (const row of page) await indexPlace(ctx, row);
    logEvent("info", "places_reindexed", { count: page.length, done: isDone });
    if (!isDone)
      await ctx.scheduler.runAfter(0, internal.places.reindexPage, {
        cursor: continueCursor,
      });
    return null;
  },
});
