import { userRemovals, removalValidator } from "./model/placeRemovals";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import { readyCitySaves } from "./items";
import { requireUserId } from "./model/auth";
import { recentVisits } from "./model/placeVisits";
import { listPlanClaimValidator } from "./model/sharedLists";
import { namesOneVenue } from "./model/dateRank";
import { MAX_PLAN_ITEMS, planSourceValidator } from "./model/plan";
import { rateLimiter } from "./model/rateLimiter";
import { MAX_CITY_CHARS, pinsForCity, tidyCity } from "./model/trip";
import { claimListPlan } from "./sharedLists";
import { requireProEntitlement } from "./subscriptions";
import { beenPlaces, toPlanSource } from "./tripData";
import { savedPinValidator } from "./tripPlannerData";

const TAGS_PER_SAVE = 8;

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
  },
});
