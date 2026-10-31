import { userRemovals, removalValidator } from "./model/placeRemovals";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import { readyCitySaves } from "./items";
import { requireUserId } from "./model/auth";
import { listPlanPlaceValidator } from "./model/sharedLists";
import {
  MAX_PLAN_ITEMS,
  placeKey,
  planSourceValidator,
  splitSavedPlace,
} from "./model/plan";
import { sameVenue } from "./model/datePlan";
import { rateLimiter } from "./model/rateLimiter";
import { MAX_CITY_CHARS, pinsForCity, tidyCity } from "./model/trip";
import {
  listAiAllowed,
  listPlanPlaces,
  requireCoveredList,
} from "./sharedLists";
import { requireProEntitlement } from "./subscriptions";
import { beenPlaces, toPlanSource } from "./tripData";
import { recentVisits, savedPinValidator } from "./tripPlannerData";

const TAGS_PER_SAVE = 8;

/**
 * Whether the save names one venue, so its tags describe that venue. Counted over the whole
 * save before any city filter, with a place named in its places, its pins and its Maps links
 * counted once.
 */
function namesOneVenue(item: Doc<"items">): boolean {
  const pins = item.placePins ?? [];
  const keyOf = (name: string) => placeKey(splitSavedPlace(name).name);
  const venueOf = (pin: (typeof pins)[number]) => ({
    ...pin,
    name: splitSavedPlace(pin.name).name,
  });
  const names = [
    ...(item.intents ?? [])
      .filter((intent) => intent.kind === "open_maps")
      .map((intent) => intent.value),
    ...(item.places ?? []),
    ...pins.map((pin) => pin.name),
  ];
  const venues = new Set(names.map(keyOf).filter((key) => key !== ""));
  // Two pins of one name in different spots are two branches, not one venue.
  const branches = pins.some((pin, i) =>
    pins
      .slice(0, i)
      .some(
        (other) =>
          keyOf(other.name) === keyOf(pin.name) &&
          !sameVenue(venueOf(other), venueOf(pin)),
      ),
  );
  return venues.size === 1 && !branches;
}

/**
 * Checks the caller may plan a date, spends one plan from the rate limit before anything is
 * looked up, and reads the city's ready saves with their pins, tags and age.
 */
export const claimDatePlanInternal = internalMutation({
  args: { city: v.string(), listId: v.optional(v.id("sharedLists")) },
  returns: v.object({
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
    places: v.array(listPlanPlaceValidator),
    aiAllowed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.listId === undefined) await requireProEntitlement(ctx, userId);
    const city = tidyCity(args.city).slice(0, MAX_CITY_CHARS);
    if (city === "") throw new Error("City required");
    if (args.listId !== undefined) {
      const list = await requireCoveredList(ctx, args.listId, userId);
      await rateLimiter.limit(ctx, "makePlan", { key: userId, throws: true });
      const { rows, places } = await listPlanPlaces(ctx, list, userId, city);
      return {
        city,
        sources: [],
        removed: await userRemovals(ctx, userId),
        been: await recentVisits(ctx, userId),
        pins: [],
        saves: [],
        places,
        aiAllowed: await listAiAllowed(ctx, userId, rows),
      };
    }
    await rateLimiter.limit(ctx, "makePlan", { key: userId, throws: true });
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
      places: [],
      aiAllowed: await aiAllowed(ctx, userId),
    };
  },
});
