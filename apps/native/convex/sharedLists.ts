import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { aiAllowed } from "./aiConsent";
import { readyCitySaves } from "./items";
import {
  authedMutation,
  authedQuery,
  liveOwner,
  requireUserId,
  senderFirstName,
} from "./model/auth";
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
  sameListPlace,
  savePlaces,
  sharedListDetailValidator,
  sharedListSummaryValidator,
  sharedPlaceInputValidator,
  tidyListName,
  type NewListPlace,
} from "./model/sharedLists";
import { saveError } from "./model/saveErrors";
import { middleOf, tidyCity } from "./model/trip";
import {
  hasProEntitlement,
  hasProEntitlementStatus,
  requireProEntitlement,
} from "./subscriptions";
import { MAX_CITY_CHARS, tripSummary } from "./tripPlannerData";

const LEAVE_ROUNDS = 4;

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

export async function requireMember(
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

export async function insertListPlaces(
  ctx: MutationCtx,
  list: Doc<"sharedLists">,
  userId: Id<"users">,
  places: NewListPlace[],
  now: number,
): Promise<number> {
  const existing = await listPlaces(ctx, list._id);
  const kept: NewListPlace[] = [];
  for (const place of places) {
    if (existing.some((row) => sameListPlace(row, place))) continue;
    if (kept.some((row) => sameListPlace(row, place))) continue;
    if (existing.length + kept.length >= MAX_LIST_PLACES) break;
    kept.push(place);
  }
  for (const place of kept) {
    await ctx.db.insert("sharedListPlaces", {
      ...place,
      listId: list._id,
      addedBy: userId,
      addedAt: now,
    });
  }
  if (kept.length > 0) {
    await ctx.db.patch(list._id, {
      placeCount: existing.length + kept.length,
    });
  }
  return kept.length;
}

export const createSharedList = authedMutation({
  args: { name: v.string(), cities: v.array(v.string()) },
  returns: v.id("sharedLists"),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    await requireProEntitlement(ctx, userId);
    const name = tidyListName(args.name);
    const cities = [
      ...new Set(
        args.cities
          .map((city) => tidyCity(city).slice(0, MAX_CITY_CHARS))
          .filter((city) => city !== ""),
      ),
    ].slice(0, MAX_LIST_CITIES);
    const memberships = await ctx.db
      .query("sharedListMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_LISTS_PER_USER);
    if (memberships.length >= MAX_LISTS_PER_USER) {
      throw new Error("Too many lists");
    }
    await rateLimiter.limit(ctx, "sharedListCreate", {
      key: userId,
      throws: true,
    });
    const now = Date.now();
    const listId = await ctx.db.insert("sharedLists", {
      ownerId: userId,
      name,
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
    const list = await ctx.db.get(listId);
    if (list === null) throw new Error("List not found");
    const places: NewListPlace[] = [];
    for (const city of cities) {
      for (const item of await readyCitySaves(ctx, userId, city)) {
        places.push(...savePlaces(item, city));
      }
    }
    await insertListPlaces(ctx, list, userId, places, now);
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
      cities: listCities(places),
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
          ...(place.city !== undefined ? { city: place.city } : {}),
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
    cities: listCities(places),
    placeNames: previewNames(places),
  };
}

export const invitePreview = query({
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
    const memberships = await ctx.db
      .query("sharedListMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_LISTS_PER_USER);
    if (memberships.length >= MAX_LISTS_PER_USER) {
      throw new Error("Too many lists");
    }
    const members = await listMembers(ctx, list._id);
    if (members.length >= MAX_LIST_MEMBERS) throw new Error("List is full");
    await ctx.db.insert("sharedListMembers", {
      listId: list._id,
      userId,
      joinedAt: Date.now(),
      seenAt: 0,
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
    for (let round = 0; round < LEAVE_ROUNDS; round++) {
      const list = await ctx.db.get(found.list._id);
      if (list === null || (await departMember(ctx, list, userId))) break;
    }
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
    .take(LIST_DRAIN_BATCH);
  for (const row of memberships) {
    if ((await ctx.db.get(row._id)) === null) continue;
    const list = await ctx.db.get(row.listId);
    if (list === null) {
      await ctx.db.delete(row._id);
      continue;
    }
    if (!(await departMember(ctx, list, userId))) return false;
  }
  if (memberships.length === LIST_DRAIN_BATCH) return false;
  const owned = await ctx.db
    .query("sharedLists")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .take(LIST_DRAIN_BATCH);
  for (const list of owned) {
    if (!(await departMember(ctx, list, userId))) return false;
  }
  return owned.length !== LIST_DRAIN_BATCH;
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
    const city =
      args.city === undefined
        ? undefined
        : tidyCity(args.city).slice(0, MAX_CITY_CHARS) || undefined;
    return await insertListPlaces(
      ctx,
      list,
      userId,
      savePlaces(item, city),
      Date.now(),
    );
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
      sameListPlace(row, next),
    );
    if (existing !== undefined) return existing._id;
    if (list.placeCount >= MAX_LIST_PLACES) throw new Error("List is full");
    const placeId = await ctx.db.insert("sharedListPlaces", {
      ...next,
      listId: list._id,
      addedBy: userId,
      addedAt: Date.now(),
    });
    await ctx.db.patch(list._id, { placeCount: list.placeCount + 1 });
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

export async function listAiAllowed(
  ctx: QueryCtx,
  userId: Id<"users">,
  places: { addedBy: Id<"users"> }[],
): Promise<boolean> {
  for (const id of new Set([userId, ...places.map((p) => p.addedBy)])) {
    if (!(await aiAllowed(ctx, id))) return false;
  }
  return true;
}

export async function requireCoveredList(
  ctx: MutationCtx,
  listId: Id<"sharedLists">,
  userId: Id<"users">,
): Promise<Doc<"sharedLists">> {
  const { list } = await requireMember(ctx, listId, userId);
  const covered = await listCovered(ctx, list, userId, (id) =>
    hasProEntitlement(ctx, id),
  );
  if (!covered) throw saveError("pro_required");
  return list;
}

export const claimListSearchInternal = internalMutation({
  args: { listId: v.id("sharedLists") },
  returns: v.object({
    city: v.optional(v.string()),
    centre: v.union(v.null(), v.object({ lat: v.number(), lng: v.number() })),
    aiAllowed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const list = await requireCoveredList(ctx, args.listId, userId);
    await rateLimiter.limit(ctx, "sharedListSearch", {
      key: userId,
      throws: true,
    });
    const places = await listPlaces(ctx, list._id);
    const city = listCities(places)[0];
    return {
      ...(city !== undefined ? { city } : {}),
      centre: middleOf(places),
      aiAllowed: await listAiAllowed(ctx, userId, places),
    };
  },
});
