import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import {
  CITY_PHOTO_RECOVER_BATCH,
  CITY_PHOTO_RETRY_MS,
  shouldLookUp,
} from "./model/cityPhoto";
import { cityKey, MAX_CITY_CHARS, tidyCity } from "./model/trip";

const CITIES_PER_REQUEST = 10;
const BACKFILL_PAGE = 100;
const BACKFILL_SPACING_MS = 1500;

async function photoRow(ctx: QueryCtx, key: string) {
  return await ctx.db
    .query("cityPhotos")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

function uniqueCities(cities: readonly string[]): Map<string, string> {
  const wanted = new Map<string, string>();
  for (const raw of cities) {
    const city = tidyCity(raw);
    const key = cityKey(city);
    if (key === "" || city.length > MAX_CITY_CHARS || wanted.has(key)) continue;
    wanted.set(key, city);
  }
  return wanted;
}

async function scheduleLookUps(
  ctx: MutationCtx,
  wanted: Map<string, string>,
  spacingMs: number,
  limit = Infinity,
): Promise<number> {
  const now = Date.now();
  let scheduled = 0;
  for (const [key, city] of wanted) {
    if (scheduled >= limit) break;
    const row = await photoRow(ctx, key);
    if (!shouldLookUp(row, now)) continue;
    if (row === null) {
      await ctx.db.insert("cityPhotos", {
        key,
        city,
        status: "pending",
        checkedAt: now,
      });
    } else {
      await ctx.db.patch(row._id, { status: "pending", checkedAt: now });
    }
    await ctx.scheduler.runAfter(
      scheduled * spacingMs,
      internal.cityPhotoLookup.lookUp,
      { key, city },
    );
    scheduled += 1;
  }
  return scheduled;
}

export async function requestCityPhotos(
  ctx: MutationCtx,
  cities: readonly string[],
): Promise<void> {
  await scheduleLookUps(ctx, uniqueCities(cities), 0, CITIES_PER_REQUEST);
}

export async function cityPhotoUrls(
  ctx: QueryCtx,
  cities: readonly string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const city of cities) {
    const key = cityKey(city);
    if (key === "" || urls.has(key)) continue;
    const row = await photoRow(ctx, key);
    if (row?.status === "found" && row.url !== undefined) {
      urls.set(key, row.url);
    }
  }
  return urls;
}

export const store = internalMutation({
  args: {
    key: v.string(),
    status: v.union(
      v.literal("found"),
      v.literal("missing"),
      v.literal("failed"),
    ),
    url: v.optional(v.string()),
    file: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await photoRow(ctx, args.key);
    if (row === null) return null;
    await ctx.db.patch(row._id, {
      status: args.status,
      url: args.status === "found" ? args.url : undefined,
      file: args.status === "found" ? args.file : undefined,
      checkedAt: Date.now(),
    });
    return null;
  },
});

export const backfillPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("items")
      .paginate({ cursor: args.cursor, numItems: BACKFILL_PAGE });
    const allowed = new Map<string, boolean>();
    const cities: string[] = [];
    for (const item of page.page) {
      if (item.status !== "ready" || (item.cities ?? []).length === 0) continue;
      if (!allowed.has(item.userId)) {
        allowed.set(item.userId, await aiAllowed(ctx, item.userId));
      }
      if (allowed.get(item.userId)) cities.push(...(item.cities ?? []));
    }
    const scheduled = await scheduleLookUps(
      ctx,
      uniqueCities(cities),
      BACKFILL_SPACING_MS,
    );
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        scheduled * BACKFILL_SPACING_MS,
        internal.cityPhotos.backfillPage,
        { cursor: page.continueCursor },
      );
    }
    return null;
  },
});

export const recoverStale = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - CITY_PHOTO_RETRY_MS;
    const stale = async (status: "failed" | "pending") =>
      await ctx.db
        .query("cityPhotos")
        .withIndex("by_status_and_checkedAt", (q) =>
          q.eq("status", status).lt("checkedAt", cutoff),
        )
        .take(CITY_PHOTO_RECOVER_BATCH);
    const oldest = [...(await stale("failed")), ...(await stale("pending"))]
      .sort((a, b) => a.checkedAt - b.checkedAt)
      .slice(0, CITY_PHOTO_RECOVER_BATCH);
    const wanted = new Map(oldest.map((row) => [row.key, row.city]));
    await scheduleLookUps(ctx, wanted, BACKFILL_SPACING_MS);
    return null;
  },
});
