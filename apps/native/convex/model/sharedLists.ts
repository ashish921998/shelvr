import { type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { liveOwner } from "./auth";
import { namesOneVenue } from "./dateRank";
import { removalValidator } from "./placeRemovals";
import { MAX_LIST_NAME_CHARS } from "./sharedListLimits";
import {
  cityKey,
  countCities,
  MAX_CITY_CHARS,
  pinsForCity,
  uniquePlacePins,
} from "./trip";
import { tidyPlace, tidyText } from "./tripPlace";
import {
  tripPlaceValidator,
  tripPlanSummaryValidator,
  type TripPlace,
} from "./tripPlan";

export const MAX_LIST_PLACES = 200;
export const MAX_LIST_MEMBERS = 8;
export const MAX_LISTS_PER_USER = 20;
export const LIST_DRAIN_BATCH = 100;
export const LIST_TRIPS_SHOWN = 20;
const MEMBER_SCAN = 50;
const TAGS_PER_PLACE = 8;
const PREVIEW_PLACE_NAMES = 2;

export const sharedListMemberValidator = v.object({
  userId: v.id("users"),
  firstName: v.optional(v.string()),
  isYou: v.boolean(),
  isOwner: v.boolean(),
  joinedAt: v.number(),
});

export const sharedListPlaceValidator = v.object({
  _id: v.id("sharedListPlaces"),
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  city: v.string(),
  appleId: v.optional(v.string()),
  category: v.optional(v.string()),
  itemId: v.optional(v.id("items")),
  addedByYou: v.boolean(),
  addedByName: v.optional(v.string()),
  addedAt: v.number(),
  isNew: v.boolean(),
  visitedAt: v.optional(v.number()),
});

export const sharedListSummaryValidator = v.object({
  _id: v.id("sharedLists"),
  name: v.string(),
  placeCount: v.number(),
  newCount: v.number(),
  isOwner: v.boolean(),
  members: v.array(
    v.object({ firstName: v.optional(v.string()), isYou: v.boolean() }),
  ),
});

export const sharedListDetailValidator = v.object({
  _id: v.id("sharedLists"),
  name: v.string(),
  inviteToken: v.string(),
  isOwner: v.boolean(),
  covered: v.boolean(),
  placeCount: v.number(),
  cities: v.array(v.string()),
  members: v.array(sharedListMemberValidator),
  places: v.array(sharedListPlaceValidator),
  trips: v.array(tripPlanSummaryValidator),
});

export const invitePreviewValidator = v.object({
  inviterName: v.optional(v.string()),
  name: v.string(),
  placeCount: v.number(),
  cities: v.array(v.string()),
  placeNames: v.array(v.string()),
});

export const sharedPlaceInputValidator = v.object({
  ...tripPlaceValidator.fields,
  city: v.string(),
});

const listPlanPlaceValidator = v.object({
  itemId: v.optional(v.id("items")),
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
  category: v.optional(v.string()),
  tags: v.array(v.string()),
  addedAt: v.number(),
});

export const listPlanClaimValidator = v.object({
  places: v.array(listPlanPlaceValidator),
  been: v.array(v.string()),
  removed: v.array(removalValidator),
  aiAllowed: v.boolean(),
});
export type ListPlanClaim = Infer<typeof listPlanClaimValidator>;

export type NewListPlace = Omit<
  Doc<"sharedListPlaces">,
  "_id" | "_creationTime" | "listId" | "addedBy" | "addedAt" | "visitedAt"
>;

export function inviteToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function tidyListName(name: string): string {
  const tidy = tidyText(name, MAX_LIST_NAME_CHARS);
  if (tidy === undefined) throw new Error("Name required");
  return tidy;
}

export function foundPlace(input: TripPlace & { city: string }): NewListPlace {
  const { area: _area, ...place } = tidyPlace(input);
  const city = tidyText(input.city, MAX_CITY_CHARS);
  if (city === undefined) throw new Error("City required");
  return { ...place, city };
}

export function savePlaces(item: Doc<"items">, city?: string): NewListPlace[] {
  const only = item.cities?.length === 1 ? item.cities[0] : undefined;
  const tags = namesOneVenue(item) ? item.tags.slice(0, TAGS_PER_PLACE) : [];
  const pins = (
    city ? pinsForCity(item, city) : (item.placePins ?? [])
  ).flatMap((pin) => {
    const pinCity = pin.city || city || only;
    return pinCity ? [{ ...pin, city: pinCity }] : [];
  });
  return uniquePlacePins(pins).map((pin) => ({
    itemId: item._id,
    name: pin.name,
    lat: pin.lat,
    lng: pin.lng,
    city: pin.city,
    ...(pin.appleId !== undefined ? { appleId: pin.appleId } : {}),
    ...(pin.category !== undefined ? { category: pin.category } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  }));
}

export function isNewPlace(
  place: Doc<"sharedListPlaces">,
  member: Doc<"sharedListMembers">,
): boolean {
  return place.addedAt > member.seenAt && place.addedBy !== member.userId;
}

export function uniqueCities(cities: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const city of cities) {
    if (!byKey.has(cityKey(city))) byKey.set(cityKey(city), city);
  }
  return [...byKey.values()];
}

export function listCities(
  list: Doc<"sharedLists">,
  places: { city: string }[],
): string[] {
  const carried = countCities(places.map(({ city }) => ({ cities: [city] })));
  return uniqueCities([...list.cities, ...carried.map(({ city }) => city)]);
}

export function previewNames(places: { name: string }[]): string[] {
  return places.slice(0, PREVIEW_PLACE_NAMES).map((place) => place.name);
}

export async function listMembers(
  ctx: QueryCtx,
  listId: Id<"sharedLists">,
): Promise<Doc<"sharedListMembers">[]> {
  const rows = await ctx.db
    .query("sharedListMembers")
    .withIndex("by_list_and_user", (q) => q.eq("listId", listId))
    .take(MEMBER_SCAN);
  return rows.sort((a, b) => a.joinedAt - b.joinedAt);
}

export async function memberOf(
  ctx: QueryCtx,
  listId: Id<"sharedLists">,
  userId: Id<"users">,
): Promise<Doc<"sharedListMembers"> | null> {
  return await ctx.db
    .query("sharedListMembers")
    .withIndex("by_list_and_user", (q) =>
      q.eq("listId", listId).eq("userId", userId),
    )
    .first();
}

export async function listPlaces(
  ctx: QueryCtx,
  listId: Id<"sharedLists">,
): Promise<Doc<"sharedListPlaces">[]> {
  return await ctx.db
    .query("sharedListPlaces")
    .withIndex("by_list_and_added", (q) => q.eq("listId", listId))
    .order("desc")
    .take(MAX_LIST_PLACES);
}

export async function newPlaceCount(
  ctx: QueryCtx,
  member: Doc<"sharedListMembers">,
): Promise<number> {
  const fresh = await ctx.db
    .query("sharedListPlaces")
    .withIndex("by_list_and_added", (q) =>
      q.eq("listId", member.listId).gt("addedAt", member.seenAt),
    )
    .take(MAX_LIST_PLACES);
  return fresh.filter((place) => isNewPlace(place, member)).length;
}

export async function listCovered(
  ctx: QueryCtx,
  list: Doc<"sharedLists">,
  userId: Id<"users">,
  entitled: (userId: Id<"users">) => Promise<boolean>,
): Promise<boolean> {
  if (await entitled(userId)) return true;
  if ((await liveOwner(ctx, list.ownerId)) === null) return false;
  return await entitled(list.ownerId);
}

async function pickSuccessor(
  ctx: QueryCtx,
  candidates: Doc<"sharedListMembers">[],
): Promise<Doc<"sharedListMembers"> | null> {
  for (const candidate of candidates) {
    if ((await liveOwner(ctx, candidate.userId)) !== null) return candidate;
  }
  return null;
}

export async function departMember(
  ctx: MutationCtx,
  list: Doc<"sharedLists">,
  userId: Id<"users">,
): Promise<void> {
  const members = await listMembers(ctx, list._id);
  const successor = await pickSuccessor(
    ctx,
    members.filter((member) => member.userId !== userId),
  );
  if (successor === null) {
    for (const place of await listPlaces(ctx, list._id)) {
      await ctx.db.delete(place._id);
    }
    for (const member of members) {
      await ctx.db.delete(member._id);
    }
    await ctx.db.delete(list._id);
    return;
  }
  if (list.ownerId === userId) {
    await ctx.db.patch(list._id, { ownerId: successor.userId });
  }
  for (const member of members) {
    if (member.userId === userId) await ctx.db.delete(member._id);
  }
}
