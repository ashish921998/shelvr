import { type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { liveOwner } from "./auth";
import { sameTripPlace, type TripPlaceRef } from "./placeIdentity";
import { countCities, pinsForCity, uniquePlacePins } from "./trip";
import { tidyPlace } from "./tripPlace";
import {
  tripPlaceValidator,
  tripPlanSummaryValidator,
  type TripPlace,
} from "./tripPlan";

export const MAX_LIST_NAME_CHARS = 60;
export const MAX_LIST_CITIES = 5;
export const MAX_LIST_PLACES = 200;
export const MAX_LIST_MEMBERS = 8;
export const MAX_LISTS_PER_USER = 20;
export const LIST_DRAIN_BATCH = 100;
export const LIST_TRIPS_SHOWN = 5;
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
  city: v.optional(v.string()),
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
  city: v.optional(v.string()),
});

export const listPlanPlaceValidator = v.object({
  key: v.string(),
  itemId: v.optional(v.id("items")),
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  appleId: v.optional(v.string()),
  category: v.optional(v.string()),
  tags: v.array(v.string()),
  addedAt: v.number(),
});
export type ListPlanPlace = Infer<typeof listPlanPlaceValidator>;

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
  const tidy = name.replace(/\s+/g, " ").trim().slice(0, MAX_LIST_NAME_CHARS);
  if (tidy === "") throw new Error("Name required");
  return tidy;
}

export function placeRef(
  place: Pick<Doc<"sharedListPlaces">, "name" | "lat" | "lng"> & {
    appleId?: string;
    itemId?: Id<"items">;
  },
): TripPlaceRef {
  return {
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    ...(place.appleId !== undefined ? { appleId: place.appleId } : {}),
    ...(place.itemId !== undefined ? { itemId: place.itemId } : {}),
  };
}

export function sameListPlace(
  a: Parameters<typeof placeRef>[0],
  b: Parameters<typeof placeRef>[0],
): boolean {
  return sameTripPlace(placeRef(a), placeRef(b));
}

export function foundPlace(input: TripPlace & { city?: string }): NewListPlace {
  const { area: _area, ...place } = tidyPlace(input);
  const city = input.city?.replace(/\s+/g, " ").trim();
  return { ...place, ...(city ? { city } : {}) };
}

export function savePlaces(item: Doc<"items">, city?: string): NewListPlace[] {
  const pins = city ? pinsForCity(item, city) : (item.placePins ?? []);
  const only = item.cities?.length === 1 ? item.cities[0] : undefined;
  const tags = item.tags.slice(0, TAGS_PER_PLACE);
  return uniquePlacePins(pins).map((pin) => {
    const pinCity = pin.city ?? city ?? only;
    return {
      itemId: item._id,
      name: pin.name,
      lat: pin.lat,
      lng: pin.lng,
      ...(pinCity !== undefined ? { city: pinCity } : {}),
      ...(pin.appleId !== undefined ? { appleId: pin.appleId } : {}),
      ...(pin.category !== undefined ? { category: pin.category } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    };
  });
}

export function isNewPlace(
  place: Doc<"sharedListPlaces">,
  member: Doc<"sharedListMembers">,
): boolean {
  return place.addedAt > member.seenAt && place.addedBy !== member.userId;
}

export function listCities(places: { city?: string }[]): string[] {
  return countCities(
    places.map((place) => ({ cities: place.city ? [place.city] : [] })),
  ).map(({ city }) => city);
}

export function previewNames(places: { name: string }[]): string[] {
  return places.slice(0, PREVIEW_PLACE_NAMES).map((place) => place.name);
}

export async function listMembers(
  ctx: QueryCtx,
  listId: Id<"sharedLists">,
  limit = MEMBER_SCAN,
): Promise<Doc<"sharedListMembers">[]> {
  const rows = await ctx.db
    .query("sharedListMembers")
    .withIndex("by_list_and_user", (q) => q.eq("listId", listId))
    .take(limit);
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

async function drainListChildren(
  ctx: MutationCtx,
  listId: Id<"sharedLists">,
  departing: Id<"users">,
  batch: number,
): Promise<boolean> {
  const places = await ctx.db
    .query("sharedListPlaces")
    .withIndex("by_list_and_added", (q) => q.eq("listId", listId))
    .take(batch);
  for (const place of places) {
    await ctx.db.delete(place._id);
  }
  if (places.length === batch) return false;
  const members = await ctx.db
    .query("sharedListMembers")
    .withIndex("by_list_and_user", (q) => q.eq("listId", listId))
    .take(batch);
  let anchored = false;
  for (const member of members) {
    if (member.userId === departing && !anchored) {
      anchored = true;
      continue;
    }
    await ctx.db.delete(member._id);
  }
  return members.length !== batch;
}

export async function departMember(
  ctx: MutationCtx,
  list: Doc<"sharedLists">,
  userId: Id<"users">,
  batch = LIST_DRAIN_BATCH,
): Promise<boolean> {
  if (list.ownerId === userId) {
    const others = (await listMembers(ctx, list._id, batch)).filter(
      (member) => member.userId !== userId,
    );
    const successor = await pickSuccessor(ctx, others);
    if (successor !== null) {
      await ctx.db.patch(list._id, { ownerId: successor.userId });
    } else {
      if (!(await drainListChildren(ctx, list._id, userId, batch))) {
        return false;
      }
      await ctx.db.delete(list._id);
    }
  }
  const own = await ctx.db
    .query("sharedListMembers")
    .withIndex("by_list_and_user", (q) =>
      q.eq("listId", list._id).eq("userId", userId),
    )
    .take(batch);
  for (const row of own) {
    await ctx.db.delete(row._id);
  }
  return true;
}
