import { userRemovals, removalValidator } from "./model/placeRemovals";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { dateStartValidator } from "./model/datePlan";
import type { DateCandidate } from "./model/dateRank";
import { saveWhy } from "./model/tripSuggest";
import { pinFor } from "./tripPlanner";
import { aiAllowed } from "./aiConsent";
import { readyCitySaves } from "./items";
import { authedQuery, requireUserId } from "./model/auth";
import { recentVisits } from "./model/placeVisits";
import { listPlanClaimValidator } from "./model/sharedLists";
import { namesOneVenue } from "./model/dateRank";
import {
  MAX_PLAN_ITEMS,
  placeKey,
  planSourceValidator,
  suggestSavedPlaces,
} from "./model/plan";
import { rateLimiter } from "./model/rateLimiter";
import {
  dropStrays,
  MAX_CITY_CHARS,
  pinsForCity,
  tidyCity,
} from "./model/trip";
import { claimListPlan } from "./sharedLists";
import { requireProEntitlement } from "./subscriptions";
import { beenPlaces, toPlanSource } from "./tripData";
import { savedPinValidator } from "./tripPlannerData";

const TAGS_PER_SAVE = 8;

async function readSavedDate(ctx: QueryCtx, userId: Id<"users">, city: string) {
  const removed = await userRemovals(ctx, userId);
  const items = await readyCitySaves(
    ctx,
    userId,
    city,
    MAX_PLAN_ITEMS,
    removed,
  );
  const sources = items.map((item) => toPlanSource(item, city));
  return {
    from: "saves" as const,
    city,
    sources,
    removed,
    been: [
      ...new Set([
        ...(await beenPlaces(ctx, userId, sources)),
        ...(await recentVisits(ctx, userId)),
      ]),
    ],
    pins: items.flatMap((item) =>
      pinsForCity(item, city).map((pin) => ({
        itemId: item._id,
        name: pin.name,
        lat: pin.lat,
        lng: pin.lng,
        ...(pin.appleId !== undefined ? { appleId: pin.appleId } : {}),
        ...(pin.category !== undefined ? { category: pin.category } : {}),
      })),
    ),
    saves: items.map((item) => ({
      itemId: item._id,
      tags: item.tags.slice(0, TAGS_PER_SAVE),
      ownTags: namesOneVenue(item),
      savedAt: item._creationTime,
    })),
    aiAllowed: await aiAllowed(ctx, userId),
  };
}

export function savedCandidates(
  claim: Awaited<ReturnType<typeof readSavedDate>>,
): DateCandidate[] {
  const been = new Set(claim.been.map(placeKey));
  const places = suggestSavedPlaces(
    claim.sources,
    been,
    Number.MAX_SAFE_INTEGER,
  );
  const pinned = dropStrays(places.map((place) => pinFor(place, claim.pins)));
  const sources = new Map(
    claim.sources.map((source) => [source.itemId, source]),
  );
  const saves = new Map(claim.saves.map((save) => [save.itemId, save]));
  return places.flatMap((place, i) => {
    const pin = pinned[i];
    const source = sources.get(place.itemId);
    const save = saves.get(place.itemId);
    if (!pin || !source || !save) return [];
    const why = saveWhy(place, source);
    return [
      {
        itemId: place.itemId,
        name: place.name,
        ...(place.area ? { area: place.area } : {}),
        ...(why ? { why } : {}),
        lat: pin.lat,
        lng: pin.lng,
        ...(pin.appleId !== undefined ? { appleId: pin.appleId } : {}),
        ...(pin.category !== undefined ? { category: pin.category } : {}),
        tags: save.tags,
        ownTags: save.ownTags,
        savedAt: save.savedAt,
      },
    ];
  });
}

export const listDateStarts = authedQuery({
  args: { city: v.string() },
  returns: v.array(dateStartValidator),
  handler: async (ctx, { city }) => {
    const claim = await readSavedDate(
      ctx,
      ctx.userId,
      tidyCity(city).slice(0, MAX_CITY_CHARS),
    );
    return savedCandidates(claim).map(({ name, lat, lng, appleId }) => ({
      name,
      lat,
      lng,
      appleId,
    }));
  },
});

/**
 * Checks the caller may plan a date, spends one plan from the rate limit before anything is
 * looked up, and reads the city's ready saves with their pins, tags and age.
 */
export const claimDatePlanInternal = internalMutation({
  args: { city: v.string(), listId: v.optional(v.id("sharedLists")) },
  returns: v.union(
    v.object({
      from: v.literal("saves"),
      city: v.string(),
      sources: v.array(planSourceValidator),
      been: v.array(v.string()),
      removed: v.array(removalValidator),
      pins: v.array(savedPinValidator),
      saves: v.array(
        v.object({
          itemId: v.id("items"),
          tags: v.array(v.string()),
          ownTags: v.boolean(),
          savedAt: v.number(),
        }),
      ),
      aiAllowed: v.boolean(),
    }),
    v.object({
      from: v.literal("list"),
      city: v.string(),
      ...listPlanClaimValidator.fields,
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const city = tidyCity(args.city).slice(0, MAX_CITY_CHARS);
    if (city === "") throw new Error("City required");
    if (args.listId !== undefined) {
      return {
        from: "list" as const,
        city,
        ...(await claimListPlan(ctx, args.listId, userId, city, {
          bucket: "makePlan",
          needsPlaces: false,
        })),
      };
    }
    await requireProEntitlement(ctx, userId);
    await rateLimiter.limit(ctx, "makePlan", { key: userId, throws: true });
    return await readSavedDate(ctx, userId, city);
  },
});
