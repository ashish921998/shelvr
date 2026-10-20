import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import { liveOwner, requireUserId, senderFirstName } from "./model/auth";
import {
  MAX_AREA_CHARS,
  MAX_PLACE_NAME_CHARS,
  MAX_PLAN_PLACES,
  MAX_WHY_CHARS,
  placeKey,
} from "./model/plan";
import { rateLimiter } from "./model/rateLimiter";
import { requireProEntitlement } from "./subscriptions";
import { ipKey, ipNetwork } from "./model/clientIp";

// "Ask someone" on a plan: the owner sends the shortlist as a link, and the
// person who opens it votes on each place without an account or the app. The
// share is a snapshot of the plan, so the public page never calls the model,
// and it expires after a week.

/** How long a vote link stays open. */
export const PLAN_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Most people whose votes one link keeps. Past this a new voter is refused. */
export const MAX_PLAN_VOTERS = 20;
/**
 * Most vote rows one link keeps. Beyond the voters, a visitor who picked and
 * then took it all back keeps an empty row holding their ballot order.
 */
const MAX_VOTE_ROWS = MAX_PLAN_VOTERS * 2;
const MAX_CITY_CHARS = 60;
/** Shares a space or account deletion removes per transaction. */
const DELETE_BATCH = 50;

const sharedPlaceValidator = v.object({
  name: v.string(),
  area: v.optional(v.string()),
  why: v.string(),
  itemId: v.id("items"),
});

const voteOutcomeValidator = v.union(
  v.literal("recorded"),
  v.literal("missing"),
  v.literal("full"),
);

function clean(text: string, max: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The share behind a token while its owner, space and week are all live. */
async function liveShare(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"planShares"> | null> {
  const share = await ctx.db
    .query("planShares")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (share === null || share.expiresAt <= Date.now()) return null;
  if ((await liveOwner(ctx, share.userId)) === null) return null;
  const space = await ctx.db.get(share.spaceId);
  if (space === null || space.userId !== share.userId) return null;
  return share;
}

/**
 * Turns a plan the owner is looking at into a vote link and returns its
 * token. The places are the plan's own (at most five), each tied to a save
 * the caller owns; the text is clipped to the plan's limits.
 */
export const createPlanShare = mutation({
  args: {
    spaceId: v.id("spaces"),
    city: v.optional(v.string()),
    places: v.array(sharedPlaceValidator),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    await requireProEntitlement(ctx, userId);
    if (args.places.length === 0 || args.places.length > MAX_PLAN_PLACES) {
      throw new Error("A plan share needs one to five places");
    }
    const places = [];
    for (const [index, place] of args.places.entries()) {
      const item = await ctx.db.get(place.itemId);
      if (item === null || item.userId !== userId) {
        throw new Error("Item not found");
      }
      const name = clean(place.name, MAX_PLACE_NAME_CHARS);
      if (name === "") throw new Error("Place name is empty");
      const area =
        place.area === undefined ? "" : clean(place.area, MAX_AREA_CHARS);
      places.push({
        key: `p${index}`,
        name,
        ...(area !== "" ? { area } : {}),
        why: clean(place.why, MAX_WHY_CHARS),
        itemId: place.itemId,
      });
    }
    await rateLimiter.limit(ctx, "planShare", { key: userId, throws: true });
    const city =
      args.city === undefined ? "" : clean(args.city, MAX_CITY_CHARS);
    const token = newToken();
    await ctx.db.insert("planShares", {
      token,
      userId,
      spaceId: args.spaceId,
      ...(city !== "" ? { city } : {}),
      places,
      expiresAt: Date.now() + PLAN_SHARE_TTL_MS,
    });
    return token;
  },
});

/**
 * The newest open vote link for one of the caller's spaces, with each
 * place's votes so far and whether the caller marked it "We went". Places
 * whose save was deleted are left out. Null when the space has none open,
 * or none of its places is left.
 */
export const latestPlanShare = query({
  args: { spaceId: v.id("spaces") },
  returns: v.union(
    v.object({
      token: v.string(),
      city: v.optional(v.string()),
      expiresAt: v.number(),
      voters: v.number(),
      places: v.array(
        v.object({
          key: v.string(),
          name: v.string(),
          area: v.optional(v.string()),
          why: v.string(),
          itemId: v.id("items"),
          been: v.optional(v.boolean()),
          picks: v.number(),
          passes: v.number(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (space === null || space.userId !== userId) return null;
    const share = await ctx.db
      .query("planShares")
      .withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
      .order("desc")
      .first();
    if (
      share === null ||
      share.userId !== userId ||
      share.expiresAt <= Date.now()
    ) {
      return null;
    }
    const votes = await ctx.db
      .query("planVotes")
      .withIndex("by_share_and_voter", (q) => q.eq("shareId", share._id))
      .take(MAX_VOTE_ROWS);
    // Like the public page, a place whose save was deleted is left out.
    const places = [];
    for (const place of share.places) {
      const item = await ctx.db.get(place.itemId);
      if (item === null || item.userId !== userId) continue;
      const visit = await ctx.db
        .query("placeVisits")
        .withIndex("by_user_and_key", (q) =>
          q.eq("userId", userId).eq("key", placeKey(place.name)),
        )
        .unique();
      places.push({
        key: place.key,
        name: place.name,
        ...(place.area !== undefined ? { area: place.area } : {}),
        why: place.why,
        itemId: place.itemId,
        ...(visit !== null ? { been: true } : {}),
        picks: votes.filter((vote) => vote.picks.includes(place.key)).length,
        passes: votes.filter((vote) => vote.passes.includes(place.key)).length,
      });
    }
    if (places.length === 0) return null;
    return {
      token: share.token,
      city: share.city,
      expiresAt: share.expiresAt,
      voters: votes.filter(hasVote).length,
      places,
    };
  },
});

/**
 * What the public vote page shows for a token: the sender's first name, the
 * city, and each place with its reason and its save's picture. Places whose
 * save was deleted since are left out. Null for an unknown, expired or
 * orphaned link.
 */
export const getPublicPlanShare = internalQuery({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      senderName: v.optional(v.string()),
      city: v.optional(v.string()),
      expiresAt: v.number(),
      places: v.array(
        v.object({
          key: v.string(),
          name: v.string(),
          area: v.optional(v.string()),
          why: v.string(),
          imageUrl: v.optional(v.string()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const share = await liveShare(ctx, args.token);
    if (share === null) return null;
    const places = [];
    for (const place of share.places) {
      const item = await ctx.db.get(place.itemId);
      if (item === null || item.userId !== share.userId) continue;
      const imageUrl =
        item.storageId === undefined
          ? null
          : await ctx.storage.getUrl(item.storageId);
      places.push({
        key: place.key,
        name: place.name,
        area: place.area,
        why: place.why,
        ...(imageUrl !== null ? { imageUrl } : {}),
      });
    }
    if (places.length === 0) return null;
    return {
      senderName: await senderFirstName(ctx, share.userId),
      city: share.city,
      expiresAt: share.expiresAt,
      places,
    };
  },
});

/**
 * Stores one visitor's votes on a link, replacing what they sent before.
 * Keys not on the link are dropped, and a key in both lists counts as a
 * pick. A ballot with a revision older than the stored one is a late
 * arrival and leaves the newer vote alone. Rate limited per visitor IP and
 * site-wide; a link keeps at most MAX_PLAN_VOTERS voters, and one network
 * can add only a few of them.
 */
export const recordPlanVote = internalMutation({
  args: {
    token: v.string(),
    voterId: v.string(),
    picks: v.array(v.string()),
    passes: v.array(v.string()),
    revision: v.optional(v.number()),
    ip: v.optional(v.string()),
  },
  returns: voteOutcomeValidator,
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "planVoteGlobal", { throws: true });
    await rateLimiter.limit(ctx, "planVoteIp", {
      key: ipKey(args.ip),
      throws: true,
    });
    const voterId = args.voterId;
    const share = await liveShare(ctx, args.token);
    if (share === null) return "missing";
    const keys = new Set(share.places.map((place) => place.key));
    const picks = [...new Set(args.picks)].filter((key) => keys.has(key));
    const passes = [...new Set(args.passes)].filter(
      (key) => keys.has(key) && !picks.includes(key),
    );
    const existing = await ctx.db
      .query("planVotes")
      .withIndex("by_share_and_voter", (q) =>
        q.eq("shareId", share._id).eq("voterId", voterId),
      )
      .unique();
    const empty = picks.length === 0 && passes.length === 0;
    if (existing !== null) {
      if (
        existing.revision !== undefined &&
        args.revision !== undefined &&
        args.revision < existing.revision
      ) {
        return "recorded";
      }
      // An empty row holds no voter, so turning it into a vote needs a slot.
      if (
        !empty &&
        !hasVote(existing) &&
        (await activeVoters(ctx, share._id)) >= MAX_PLAN_VOTERS
      ) {
        return "full";
      }
      await ctx.db.patch(existing._id, {
        picks,
        passes,
        revision: args.revision,
        updatedAt: Date.now(),
      });
      return "recorded";
    }
    // An empty ballot from someone new holds no vote. With a revision it is
    // still kept, so an earlier ballot of theirs that lands after it can't
    // bring back a withdrawn pick. It takes no voter slot, and past the row
    // cap it is dropped as before.
    if (empty && args.revision === undefined) return "recorded";
    const rows = await ctx.db
      .query("planVotes")
      .withIndex("by_share_and_voter", (q) => q.eq("shareId", share._id))
      .take(MAX_VOTE_ROWS);
    if (rows.length >= MAX_VOTE_ROWS) return empty ? "recorded" : "full";
    if (!empty && rows.filter(hasVote).length >= MAX_PLAN_VOTERS) {
      return "full";
    }
    await rateLimiter.limit(ctx, "planVoterSlot", {
      key: `${share._id}:${ipNetwork(args.ip)}`,
      throws: true,
    });
    await ctx.db.insert("planVotes", {
      shareId: share._id,
      voterId,
      picks,
      passes,
      revision: args.revision,
      updatedAt: Date.now(),
    });
    return "recorded";
  },
});

function hasVote(vote: Doc<"planVotes">): boolean {
  return vote.picks.length + vote.passes.length > 0;
}

async function activeVoters(
  ctx: QueryCtx,
  shareId: Id<"planShares">,
): Promise<number> {
  const rows = await ctx.db
    .query("planVotes")
    .withIndex("by_share_and_voter", (q) => q.eq("shareId", shareId))
    .take(MAX_VOTE_ROWS);
  return rows.filter(hasVote).length;
}

async function deleteShare(ctx: MutationCtx, share: Doc<"planShares">) {
  const votes = await ctx.db
    .query("planVotes")
    .withIndex("by_share_and_voter", (q) => q.eq("shareId", share._id))
    .take(MAX_VOTE_ROWS);
  for (const vote of votes) {
    await ctx.db.delete(vote._id);
  }
  await ctx.db.delete(share._id);
}

/** Deletes up to one batch of a space's vote links and their votes. Returns
 * true when none remain. */
export async function deletePlanSharesForSpace(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
): Promise<boolean> {
  const shares = await ctx.db
    .query("planShares")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .take(DELETE_BATCH);
  for (const share of shares) {
    await deleteShare(ctx, share);
  }
  return shares.length !== DELETE_BATCH;
}

/** Deletes up to one batch of a user's vote links and their votes. Returns
 * true when none remain. */
export async function deletePlanSharesForUser(
  ctx: MutationCtx,
  userKey: string,
): Promise<boolean> {
  const shares = await ctx.db
    .query("planShares")
    .withIndex("by_user", (q) => q.eq("userId", userKey))
    .take(DELETE_BATCH);
  for (const share of shares) {
    await deleteShare(ctx, share);
  }
  return shares.length !== DELETE_BATCH;
}

/**
 * Daily cleanup: deletes vote links a week past their expiry, with their
 * votes, one batch per transaction. A full batch schedules the next.
 */
export const purgeExpiredPlanShares = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - PLAN_SHARE_TTL_MS;
    const shares = await ctx.db
      .query("planShares")
      .withIndex("by_expires", (q) => q.lt("expiresAt", cutoff))
      .take(DELETE_BATCH);
    for (const share of shares) {
      await deleteShare(ctx, share);
    }
    if (shares.length === DELETE_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.planShares.purgeExpiredPlanShares,
        {},
      );
    }
    return null;
  },
});
