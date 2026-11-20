import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { MAX_MAP_PLACES } from "./mapPlaces";
import { authedQuery } from "./model/auth";
import { cuisineValidator } from "./model/itemFields";
import { logEvent } from "./model/log";
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

export const forMap = authedQuery({
  args: {},
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
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("places")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .take(MAX_MAP_PLACES);
    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      city: row.city,
      appleId: row.appleId,
      ...(row.category ? { category: row.category } : {}),
      ...(row.cuisine ? { cuisine: row.cuisine } : {}),
      kinds: placeKinds(row.category, [], row.cuisine),
    }));
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
        await ctx.db.insert("places", {
          name: place.name,
          city: args.city,
          lat: place.lat,
          lng: place.lng,
          appleId: place.appleId,
          ...(place.category ? { category: place.category } : {}),
          ...(args.source ? { sources: [{ url: args.source }] } : {}),
          status: "live",
          addedAt: Date.now(),
        });
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
