import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import { readyCitySaves } from "./items";
import { requireUserId } from "./model/auth";
import {
  MAX_PLAN_ITEMS,
  placeKey,
  planSourceValidator,
  splitSavedPlace,
} from "./model/plan";
import { rateLimiter } from "./model/rateLimiter";
import { pinsForCity, tidyCity } from "./model/trip";
import { requireProEntitlement } from "./subscriptions";
import { beenPlaces, toPlanSource } from "./tripData";
import {
  MAX_CITY_CHARS,
  recentVisits,
  savedPinValidator,
} from "./tripPlannerData";

const TAGS_PER_SAVE = 8;

/**
 * Whether the save names one venue, so its tags describe that venue. Counted over the whole
 * save before any city filter, with a place named in its places, its pins and its Maps links
 * counted once.
 */
function namesOneVenue(item: Doc<"items">): boolean {
  const names = [
    ...(item.intents ?? [])
      .filter((intent) => intent.kind === "open_maps")
      .map((intent) => intent.value),
    ...(item.places ?? []),
    ...(item.placePins ?? []).map((pin) => pin.name),
  ];
  const venues = new Set(
    names
      .map((name) => placeKey(splitSavedPlace(name).name))
      .filter((key) => key !== ""),
  );
  return venues.size === 1;
}

/**
 * Checks the caller may plan a date, spends one plan from the rate limit before anything is
 * looked up, and reads the city's ready saves with their pins, tags and age.
 */
export const claimDatePlanInternal = internalMutation({
  args: { city: v.string() },
  returns: v.object({
    city: v.string(),
    sources: v.array(planSourceValidator),
    been: v.array(v.string()),
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
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    const city = tidyCity(args.city).slice(0, MAX_CITY_CHARS);
    if (city === "") throw new Error("City required");
    await rateLimiter.limit(ctx, "makePlan", { key: userId, throws: true });
    const items = await readyCitySaves(ctx, userId, city, MAX_PLAN_ITEMS);
    const sources = items.map((item) => toPlanSource(item, undefined, city));
    return {
      city,
      sources,
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
  },
});
