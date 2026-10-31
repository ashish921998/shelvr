import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import { readySavesNewestFirst } from "./items";
import {
  authedMutation,
  authedQuery,
  liveOwner,
  requireUserId,
  senderFirstName,
} from "./model/auth";
import { recentVisits } from "./model/placeVisits";
import { userRemovals, visibleSave } from "./model/placeRemovals";
import { placeKey } from "./model/plan";
import { rateLimiter } from "./model/rateLimiter";
import {
  departMember,
  foundPlace,
  inviteToken,
  invitePreviewValidator,
  isNewPlace,
  listCities,
  listCovered,
  listMembers,
  listPlaces,
  LIST_DRAIN_BATCH,
  LIST_TRIPS_SHOWN,
  MAX_LIST_CITIES,
  MAX_LIST_MEMBERS,
  MAX_LIST_PLACES,
  MAX_LISTS_PER_USER,
  memberOf,
  newPlaceCount,
  previewNames,
  savePlaces,
  sharedListDetailValidator,
  sharedListSummaryValidator,
  sharedPlaceInputValidator,
  tidyListName,
  uniqueCities,
  type ListPlanClaim,
  type NewListPlace,
} from "./model/sharedLists";
import { sameTripPlace } from "./model/placeIdentity";
import { saveError } from "./model/saveErrors";
import { cityKey, MAX_CITY_CHARS } from "./model/trip";
import { tidyText, tripSummary } from "./model/tripPlace";
import {
  hasProEntitlement,
  hasProEntitlementStatus,
  requireProEntitlement,
} from "./subscriptions";

async function memberList(
  ctx: QueryCtx,
  listId: Id<"sharedLists">,
  userId: Id<"users">,
): Promise<{
  list: Doc<"sharedLists">;
  membership: Doc<"sharedListMembers">;
} | null> {
  const list = await ctx.db.get(listId);
  if (list === null) return null;
  const membership = await memberOf(ctx, listId, userId);
  return membership === null ? null : { list, membership };
}

async function requireMember(
  ctx: QueryCtx,
  listId: Id<"sharedLists">,
  userId: Id<"users">,
): Promise<{ list: Doc<"sharedLists">; membership: Doc<"sharedListMembers"> }> {
  const found = await memberList(ctx, listId, userId);
  if (found === null) throw new Error("List not found");
  return found;
}

async function liveList(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"sharedLists"> | null> {
  if (token === "") return null;
  const list = await ctx.db
    .query("sharedLists")
    .withIndex("by_invite_token", (q) => q.eq("inviteToken", token))
    .unique();
  if (list === null) return null;
  return (await liveOwner(ctx, list.ownerId)) === null ? null : list;
}

async function insertListPlaces(
  ctx: MutationCtx,
  listId: Id<"sharedLists">,
  userId: Id<"users">,
  places: NewListPlace[],
  now: number,
): Promise<Id<"sharedListPlaces">[]> {
  const existing = await listPlaces(ctx, listId);
  const kept: NewListPlace[] = [];
  for (const place of places) {
    if (existing.some((row) => sameTripPlace(row, place))) continue;
    if (kept.some((row) => sameTripPlace(row, place))) continue;
    if (existing.length + kept.length >= MAX_LIST_PLACES) break;
    kept.push(place);
  }
  const ids: Id<"sharedListPlaces">[] = [];
  for (const place of kept) {
    ids.push(
      await ctx.db.insert("sharedListPlaces", {
        ...place,
        listId,
        addedBy: userId,
        addedAt: now,
      }),
    );
  }
  if (ids.length > 0) {
    await ctx.db.patch(listId, { placeCount: existing.length + ids.length });
  }
  return ids;
}

async function requireListRoom(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<void> {
  const memberships = await ctx.db
    .query("sharedListMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_LISTS_PER_USER);
  if (memberships.length >= MAX_LISTS_PER_USER) {
    throw new Error("Too many lists");
  }
}

export const createSharedList = authedMutation({
  args: { name: v.string(), cities: v.array(v.string()) },
  returns: v.id("sharedLists"),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    await requireProEntitlement(ctx, userId);
    const name = tidyListName(args.name);
    const cities = uniqueCities(
      args.cities.flatMap((city) => tidyText(city, MAX_CITY_CHARS) ?? []),
    ).slice(0, MAX_LIST_CITIES);
    if (cities.length === 0) throw new Error("City required");
    await requireListRoom(ctx, userId);
    await rateLimiter.limit(ctx, "sharedListCreate", {
      key: userId,
      throws: true,
    });
    const now = Date.now();
    const listId = await ctx.db.insert("sharedLists", {
      ownerId: userId,
      name,
      cities,
      inviteToken: inviteToken(),
      placeCount: 0,
      createdAt: now,
    });
    await ctx.db.insert("sharedListMembers", {
      listId,
      userId,
      joinedAt: now,
      seenAt: now,
    });
    const places: NewListPlace[] = [];
    const saves = await readySavesNewestFirst(ctx, userId);
    for (const city of cities) {
      const wanted = cityKey(city);
      for (const item of saves) {
        if ((item.cities ?? []).some((c) => cityKey(c) === wanted)) {
          places.push(...savePlaces(item, city));
        }
      }
    }
    await insertListPlaces(ctx, listId, userId, places, now);
    return listId;
  },
});

async function memberNames(
  ctx: QueryCtx,
  members: Doc<"sharedListMembers">[],
): Promise<Map<Id<"users">, string | undefined>> {
  const names = new Map<Id<"users">, string | undefined>();
  for (const member of members) {
    names.set(member.userId, await senderFirstName(ctx, member.userId));
  }
  return names;
}

export const listSharedLists = authedQuery({
  args: {},
  returns: v.array(sharedListSummaryValidator),
  handler: async (ctx) => {
    const { userId } = ctx;
    const memberships = await ctx.db
      .query("sharedListMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_LISTS_PER_USER);
    const lists = [];
    for (const membership of memberships) {
      const list = await ctx.db.get(membership.listId);
      if (list === null) continue;
      const members = await listMembers(ctx, list._id);
      const names = await memberNames(ctx, members);
      lists.push({
        _id: list._id,
        name: list.name,
        placeCount: list.placeCount,
        newCount: await newPlaceCount(ctx, membership),
        isOwner: list.ownerId === userId,
        members: members.map((member) => {
          const firstName = names.get(member.userId);
          return {
            ...(firstName !== undefined ? { firstName } : {}),
            isYou: member.userId === userId,
          };
        }),
      });
    }
    return lists.sort((a, b) => b.newCount - a.newCount);
  },
});

export const getSharedList = authedQuery({
  args: { listId: v.id("sharedLists") },
  returns: v.union(v.null(), sharedListDetailValidator),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const found = await memberList(ctx, args.listId, userId);
    if (found === null) return null;
    const { list, membership } = found;
    const members = await listMembers(ctx, list._id);
    const names = await memberNames(ctx, members);
    const places = await listPlaces(ctx, list._id);
    const trips = await ctx.db
      .query("tripPlans")
      .withIndex("by_user_and_list", (q) =>
        q.eq("userId", userId).eq("listId", list._id),
      )
      .order("desc")
      .take(LIST_TRIPS_SHOWN);
    return {
      _id: list._id,
      name: list.name,
      inviteToken: list.inviteToken,
      isOwner: list.ownerId === userId,
      covered: await listCovered(ctx, list, userId, (id) =>
        hasProEntitlementStatus(ctx, id),
      ),
      placeCount: list.placeCount,
      cities: listCities(list, places),
      members: members.map((member) => {
        const firstName = names.get(member.userId);
        return {
          userId: member.userId,
          ...(firstName !== undefined ? { firstName } : {}),
          isYou: member.userId === userId,
          isOwner: member.userId === list.ownerId,
          joinedAt: member.joinedAt,
        };
      }),
      places: places.map((place) => {
        const addedByName = names.get(place.addedBy);
        const own = place.addedBy === userId;
        return {
          _id: place._id,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          city: place.city,
          ...(place.appleId !== undefined ? { appleId: place.appleId } : {}),
          ...(place.category !== undefined ? { category: place.category } : {}),
          ...(own && place.itemId !== undefined
            ? { itemId: place.itemId }
            : {}),
          addedByYou: own,
          ...(addedByName !== undefined ? { addedByName } : {}),
          addedAt: place.addedAt,
          isNew: isNewPlace(place, membership),
          ...(place.visitedAt !== undefined
            ? { visitedAt: place.visitedAt }
            : {}),
        };
      }),
      trips: trips.map(tripSummary),
    };
  },
});

async function invitePreviewOf(ctx: QueryCtx, token: string) {
  const list = await liveList(ctx, token);
  if (list === null) return null;
  const places = await listPlaces(ctx, list._id);
  const inviterName = await senderFirstName(ctx, list.ownerId);
  return {
    ...(inviterName !== undefined ? { inviterName } : {}),
    name: list.name,
    placeCount: list.placeCount,
    cities: listCities(list, places),
    placeNames: previewNames(places),
  };
}

export const invitePreview = query({
  args: { token: v.string() },
  returns: v.union(v.null(), invitePreviewValidator),
  handler: async (ctx, args) => await invitePreviewOf(ctx, args.token),
});

export const getPublicInvite = internalQuery({
  args: { token: v.string() },
  returns: v.union(v.null(), invitePreviewValidator),
  handler: async (ctx, args) => await invitePreviewOf(ctx, args.token),
});

export const joinSharedList = authedMutation({
  args: { token: v.string() },
  returns: v.union(v.null(), v.id("sharedLists")),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const list = await liveList(ctx, args.token);
    if (list === null) return null;
    if ((await memberOf(ctx, list._id, userId)) !== null) return list._id;
    await rateLimiter.limit(ctx, "sharedListJoin", {
      key: userId,
      throws: true,
    });
    await requireListRoom(ctx, userId);
    const members = await listMembers(ctx, list._id);
    if (members.length >= MAX_LIST_MEMBERS) throw new Error("List is full");
    const now = Date.now();
    await ctx.db.insert("sharedListMembers", {
      listId: list._id,
      userId,
      joinedAt: now,
      seenAt: now,
    });
    return list._id;
  },
});

export const leaveSharedList = authedMutation({
  args: { listId: v.id("sharedLists") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const found = await memberList(ctx, args.listId, userId);
    if (found === null) return null;
    await departMember(ctx, found.list, userId);
    return null;
  },
});

export async function deleteSharedListsBatch(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const places = await ctx.db
    .query("sharedListPlaces")
    .withIndex("by_added_by", (q) => q.eq("addedBy", userId))
    .take(LIST_DRAIN_BATCH);
  const removed = new Map<Id<"sharedLists">, number>();
  for (const place of places) {
    await ctx.db.delete(place._id);
    removed.set(place.listId, (removed.get(place.listId) ?? 0) + 1);
  }
  for (const [listId, count] of removed) {
    const list = await ctx.db.get(listId);
    if (list !== null) {
      await ctx.db.patch(listId, {
        placeCount: Math.max(0, list.placeCount - count),
      });
    }
  }
  if (places.length === LIST_DRAIN_BATCH) return false;
  const memberships = await ctx.db
    .query("sharedListMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(2);
  const [membership] = memberships;
  if (membership === undefined) return true;
  const list = await ctx.db.get(membership.listId);
  if (list === null) await ctx.db.delete(membership._id);
  else await departMember(ctx, list, userId);
  return memberships.length === 1;
}

export const removeSharedListMember = authedMutation({
  args: { listId: v.id("sharedLists"), memberId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const { list } = await requireMember(ctx, args.listId, userId);
    if (list.ownerId !== userId) throw new Error("Only the owner can remove");
    if (args.memberId === userId) throw new Error("Leave the list instead");
    const membership = await memberOf(ctx, list._id, args.memberId);
    if (membership === null) return null;
    await ctx.db.delete(membership._id);
    await ctx.db.patch(list._id, { inviteToken: inviteToken() });
    return null;
  },
});

async function requireEditableList(
  ctx: MutationCtx,
  listId: Id<"sharedLists">,
  userId: Id<"users">,
): Promise<Doc<"sharedLists">> {
  const { list } = await requireMember(ctx, listId, userId);
  await rateLimiter.limit(ctx, "sharedListEdit", { key: userId, throws: true });
  return list;
}

async function memberPlace(
  ctx: MutationCtx,
  placeId: Id<"sharedListPlaces">,
  userId: Id<"users">,
): Promise<{ list: Doc<"sharedLists">; place: Doc<"sharedListPlaces"> }> {
  const place = await ctx.db.get(placeId);
  if (place === null) throw new Error("Place not found");
  const list = await requireEditableList(ctx, place.listId, userId);
  return { list, place };
}

async function removePlaces(
  ctx: MutationCtx,
  list: Doc<"sharedLists">,
  places: Doc<"sharedListPlaces">[],
): Promise<number> {
  for (const place of places) {
    await ctx.db.delete(place._id);
  }
  if (places.length > 0) {
    await ctx.db.patch(list._id, {
      placeCount: Math.max(0, list.placeCount - places.length),
    });
  }
  return places.length;
}

export const addSavePlaces = authedMutation({
  args: {
    listId: v.id("sharedLists"),
    itemId: v.id("items"),
    city: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const list = await requireEditableList(ctx, args.listId, userId);
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.userId !== userId || item.status !== "ready") {
      throw new Error("Save not found");
    }
    const city = tidyText(args.city, MAX_CITY_CHARS);
    const inserted = await insertListPlaces(
      ctx,
      list._id,
      userId,
      savePlaces(await visibleSave(ctx, item), city),
      Date.now(),
    );
    return inserted.length;
  },
});

export const removeSavePlaces = authedMutation({
  args: { listId: v.id("sharedLists"), itemId: v.id("items") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const list = await requireEditableList(ctx, args.listId, userId);
    const own = (await listPlaces(ctx, list._id)).filter(
      (place) => place.addedBy === userId && place.itemId === args.itemId,
    );
    return await removePlaces(ctx, list, own);
  },
});

export const addSharedListPlace = authedMutation({
  args: { listId: v.id("sharedLists"), place: sharedPlaceInputValidator },
  returns: v.id("sharedListPlaces"),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const list = await requireEditableList(ctx, args.listId, userId);
    const next = foundPlace(args.place);
    const existing = (await listPlaces(ctx, list._id)).find((row) =>
      sameTripPlace(row, next),
    );
    if (existing !== undefined) return existing._id;
    const [placeId] = await insertListPlaces(
      ctx,
      list._id,
      userId,
      [next],
      Date.now(),
    );
    if (placeId === undefined) throw new Error("List is full");
    return placeId;
  },
});

export const removeSharedListPlace = authedMutation({
  args: { placeId: v.id("sharedListPlaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { list, place } = await memberPlace(ctx, args.placeId, ctx.userId);
    await removePlaces(ctx, list, [place]);
    return null;
  },
});

export const setSharedListPlaceVisited = authedMutation({
  args: { placeId: v.id("sharedListPlaces"), visited: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { place } = await memberPlace(ctx, args.placeId, ctx.userId);
    await ctx.db.patch(place._id, {
      visitedAt: args.visited ? Date.now() : undefined,
    });
    return null;
  },
});

export const markSharedListSeen = authedMutation({
  args: { listId: v.id("sharedLists") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const found = await memberList(ctx, args.listId, ctx.userId);
    if (found !== null) {
      await ctx.db.patch(found.membership._id, { seenAt: Date.now() });
    }
    return null;
  },
});

async function listAiAllowed(
  ctx: QueryCtx,
  userId: Id<"users">,
  places: { addedBy: Id<"users"> }[],
): Promise<boolean> {
  for (const id of new Set([userId, ...places.map((p) => p.addedBy)])) {
    if (!(await aiAllowed(ctx, id))) return false;
  }
  return true;
}

async function coveredNow(
  ctx: MutationCtx,
  list: Doc<"sharedLists">,
  userId: Id<"users">,
): Promise<boolean> {
  return await listCovered(ctx, list, userId, (id) =>
    hasProEntitlement(ctx, id),
  );
}

async function requireCoveredList(
  ctx: MutationCtx,
  listId: Id<"sharedLists">,
  userId: Id<"users">,
): Promise<Doc<"sharedLists">> {
  const { list } = await requireMember(ctx, listId, userId);
  if (!(await coveredNow(ctx, list, userId))) throw saveError("pro_required");
  return list;
}

export async function requirePlanAccess(
  ctx: MutationCtx,
  plan: Doc<"tripPlans">,
  userId: Id<"users">,
): Promise<void> {
  if (plan.listId !== undefined) {
    const found = await memberList(ctx, plan.listId, userId);
    if (found !== null && (await coveredNow(ctx, found.list, userId))) return;
  }
  await requireProEntitlement(ctx, userId);
}

async function ownSaveId(
  ctx: QueryCtx,
  place: Doc<"sharedListPlaces">,
  userId: Id<"users">,
): Promise<Id<"items"> | undefined> {
  if (place.addedBy !== userId || place.itemId === undefined) return undefined;
  const item = await ctx.db.get(place.itemId);
  return item !== null && item.userId === userId ? item._id : undefined;
}

export async function claimListPlan(
  ctx: MutationCtx,
  listId: Id<"sharedLists">,
  userId: Id<"users">,
  city: string,
  options: { bucket: "makePlan" | "createTripPlan"; needsPlaces: boolean },
): Promise<ListPlanClaim> {
  const list = await requireCoveredList(ctx, listId, userId);
  const wanted = cityKey(city);
  const been = await recentVisits(ctx, userId);
  const skipped = new Set(been.map(placeKey));
  const rows = (await listPlaces(ctx, list._id)).filter(
    (row) =>
      row.visitedAt === undefined &&
      cityKey(row.city) === wanted &&
      !skipped.has(placeKey(row.name)),
  );
  if (options.needsPlaces && rows.length === 0) {
    throw new Error("No places in this city");
  }
  await rateLimiter.limit(ctx, options.bucket, { key: userId, throws: true });
  const places: ListPlanClaim["places"] = [];
  for (const row of rows) {
    const itemId = await ownSaveId(ctx, row, userId);
    places.push({
      ...(itemId !== undefined ? { itemId } : {}),
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      ...(row.appleId !== undefined ? { appleId: row.appleId } : {}),
      ...(row.category !== undefined ? { category: row.category } : {}),
      tags: row.tags ?? [],
      addedAt: row.addedAt,
    });
  }
  return {
    places,
    been,
    removed: await userRemovals(ctx, userId),
    aiAllowed: await listAiAllowed(ctx, userId, rows),
  };
}

export const claimListSearchInternal = internalMutation({
  args: { listId: v.id("sharedLists"), city: v.string() },
  returns: v.object({
    city: v.string(),
    centre: v.null(),
    aiAllowed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireCoveredList(ctx, args.listId, userId);
    const city = tidyText(args.city, MAX_CITY_CHARS);
    if (city === undefined) throw new Error("City required");
    await rateLimiter.limit(ctx, "sharedListSearch", {
      key: userId,
      throws: true,
    });
    return { city, centre: null, aiAllowed: await aiAllowed(ctx, userId) };
  },
});
