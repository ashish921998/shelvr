import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readyCitySaves } from "./items";
import {
  authedMutation,
  authedQuery,
  liveOwner,
  senderFirstName,
} from "./model/auth";
import { rateLimiter } from "./model/rateLimiter";
import {
  departMember,
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
  tidyListName,
  type NewListPlace,
} from "./model/sharedLists";
import { tidyCity } from "./model/trip";
import {
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
