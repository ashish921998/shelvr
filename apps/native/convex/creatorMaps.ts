import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readySavesNewestFirst } from "./items";
import { authedMutation, liveOwner } from "./model/auth";
import { firstNameOf } from "./model/firstName";
import { logEvent } from "./model/log";
import { visitedPlaceKeys } from "./model/placeVisits";
import { creatorMapPlaces } from "./model/publicMap";
import { rateLimiter } from "./model/rateLimiter";
import { inviteToken, MAX_LISTS_PER_USER } from "./model/sharedLists";
import { MAX_LIST_NAME_CHARS } from "./model/sharedListLimits";
import { cityKey } from "./model/trip";
import { tidyText } from "./model/tripPlace";
import { servablePage } from "./publicMaps";
import { insertListPlaces } from "./sharedLists";

const CREATOR_MAP_PREVIEW_NAMES = 3;
const PAGE_PLACES = { step: 1, alreadyUnique: true };

type CreatorCity = {
  page: Doc<"publicMaps">;
  owner: Doc<"users">;
  city: string;
};

type RefusedStatus = "gone" | "empty" | "tooManyLists";

async function creatorCity(
  ctx: QueryCtx,
  token: string,
  city: string,
): Promise<CreatorCity | null> {
  const page = await servablePage(ctx, token);
  if (page === null || page.saveAll !== true) return null;
  if (!page.cities.includes(city)) return null;
  const owner = await liveOwner(ctx, page.userId);
  return owner === null ? null : { page, owner, city };
}

async function creatorPlaces(
  ctx: QueryCtx,
  creatorId: Id<"users">,
  city: string,
) {
  return creatorMapPlaces(
    await readySavesNewestFirst(ctx, creatorId),
    city,
    await visitedPlaceKeys(ctx, creatorId),
  );
}

async function ownCreatorList(
  ctx: QueryCtx,
  userId: Id<"users">,
  mapId: Id<"publicMaps">,
  city: string,
): Promise<{ list: Doc<"sharedLists"> | null; memberships: number }> {
  const memberships = await ctx.db
    .query("sharedListMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_LISTS_PER_USER);
  for (const membership of memberships) {
    const list = await ctx.db.get(membership.listId);
    if (
      list !== null &&
      list.ownerId === userId &&
      list.fromMap?.mapId === mapId &&
      cityKey(list.fromMap.city) === cityKey(city)
    ) {
      return { list, memberships: memberships.length };
    }
  }
  return { list: null, memberships: memberships.length };
}

async function newCreatorList(
  ctx: MutationCtx,
  userId: Id<"users">,
  found: CreatorCity,
  name: string,
  now: number,
): Promise<Id<"sharedLists">> {
  const listId = await ctx.db.insert("sharedLists", {
    ownerId: userId,
    name:
      tidyText(name, MAX_LIST_NAME_CHARS) ??
      found.city.slice(0, MAX_LIST_NAME_CHARS),
    cities: [found.city],
    inviteToken: inviteToken(),
    placeCount: 0,
    createdAt: now,
    fromMap: { mapId: found.page._id, city: found.city },
  });
  await ctx.db.insert("sharedListMembers", {
    listId,
    userId,
    joinedAt: now,
    seenAt: now,
  });
  return listId;
}

function refused<Status extends RefusedStatus>(
  status: Status,
): { status: Status } {
  logEvent("info", "creator_map_save_refused", { reason: status });
  return { status };
}

function listSaved(
  listId: Id<"sharedLists">,
  added: number,
  created: boolean,
): {
  status: "saved";
  listId: Id<"sharedLists">;
  added: number;
  created: boolean;
} {
  logEvent("info", "creator_map_saved", { added, created });
  return { status: "saved", listId, added, created };
}

export const creatorMapPreview = query({
  args: { token: v.string(), city: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      ownerName: v.optional(v.string()),
      city: v.string(),
      placeCount: v.number(),
      placeNames: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const found = await creatorCity(ctx, args.token, args.city);
    if (found === null) return null;
    const places = await creatorPlaces(ctx, found.page.userId, found.city);
    const ownerName = firstNameOf(found.owner.name);
    return {
      ...(ownerName !== undefined ? { ownerName } : {}),
      city: found.city,
      placeCount: places.length,
      placeNames: places
        .slice(0, CREATOR_MAP_PREVIEW_NAMES)
        .map((place) => place.name),
    };
  },
});

export const saveCreatorMap = authedMutation({
  args: { token: v.string(), city: v.string(), name: v.string() },
  returns: v.union(
    v.object({
      status: v.literal("saved"),
      listId: v.id("sharedLists"),
      added: v.number(),
      created: v.boolean(),
    }),
    v.object({ status: v.literal("gone") }),
    v.object({ status: v.literal("empty") }),
    v.object({ status: v.literal("tooManyLists") }),
  ),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    await rateLimiter.limit(ctx, "creatorMapSave", {
      key: userId,
      throws: true,
    });
    const found = await creatorCity(ctx, args.token, args.city);
    if (found === null) return refused("gone");
    await rateLimiter.limit(ctx, "creatorMapSavePage", {
      key: found.page.userId,
      throws: true,
    });
    const places = await creatorPlaces(ctx, found.page.userId, found.city);
    if (places.length === 0) return refused("empty");
    const now = Date.now();
    const { list, memberships } = await ownCreatorList(
      ctx,
      userId,
      found.page._id,
      found.city,
    );
    if (list !== null) {
      const ids = await insertListPlaces(
        ctx,
        list._id,
        userId,
        places,
        now,
        PAGE_PLACES,
      );
      return listSaved(list._id, ids.length, false);
    }
    if (memberships >= MAX_LISTS_PER_USER) return refused("tooManyLists");
    const listId = await newCreatorList(ctx, userId, found, args.name, now);
    const ids = await insertListPlaces(
      ctx,
      listId,
      userId,
      places,
      now,
      PAGE_PLACES,
    );
    return listSaved(listId, ids.length, true);
  },
});
