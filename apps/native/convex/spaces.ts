import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUserId } from "./model/auth";
import { hasProEntitlement, requireProEntitlement } from "./subscriptions";
import { rateLimiter } from "./model/rateLimiter";
import {
  deleteMembershipsForSpace,
  effectiveStatus,
  getMembership,
  hasSummary,
  insertMembership,
  PREVIEW_LIMIT,
  setMembershipStatus,
  SUMMARY_SCAN_LIMIT,
  summarizeMemberships,
  toSummaryPatch,
  type MembershipSummary,
} from "./model/memberships";
import { enrichItem, enrichedItemValidator, intentValidator } from "./items";

const spaceFields = {
  _id: v.id("spaces"),
  _creationTime: v.number(),
  userId: v.string(),
  fixtureKey: v.optional(v.string()),
  name: v.string(),
  description: v.optional(v.string()),
  dynamic: v.optional(v.boolean()),
  // Denormalized membership summary (see schema.ts). Optional until the
  // backfill has visited every legacy row.
  savedCount: v.optional(v.number()),
  suggestedCount: v.optional(v.number()),
  previewItemIds: v.optional(v.array(v.id("items"))),
  suggestedPreviewItemIds: v.optional(v.array(v.id("items"))),
};

/** Join rows removed per transaction when a space is deleted. */
const SPACE_DELETE_BATCH = 500;

/**
 * Backfill bounds. A transaction visits at most BACKFILL_BATCH spaces and reads
 * at most BACKFILL_READ_BUDGET join rows in total, completeness probes
 * included. The default budget is the per-space ceiling plus its probe, so a
 * space with exactly BACKFILL_SCAN_LIMIT rows still fits one transaction and
 * one above that ceiling is left legacy. Convex caps documents read per
 * transaction, so the two limits together keep a batch of large spaces from
 * exceeding it.
 */
const BACKFILL_BATCH = 10;
const BACKFILL_SCAN_LIMIT = 8000;
const BACKFILL_READ_BUDGET = BACKFILL_SCAN_LIMIT + 1;

/** A whole number at or above `min`, or `fallback` for anything else. */
function knob(value: number | undefined, min: number, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= min
    ? Math.floor(value)
    : fallback;
}

/** A space's joins split by who owns them: the user (saved) vs Shelvr (suggested). */
async function splitJoins(ctx: QueryCtx, spaceId: Id<"spaces">) {
  const joins = await ctx.db
    .query("spaceItems")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .collect();
  const saved: Doc<"spaceItems">[] = [];
  const suggested: Doc<"spaceItems">[] = [];
  for (const join of joins) {
    const status = effectiveStatus(join);
    if (status === "saved") {
      saved.push(join);
    } else if (status === "suggested") {
      suggested.push(join);
    }
    // Dismissed rows exist only so the AI never re-suggests; never surfaced.
  }
  return { saved, suggested };
}

async function loadItems(
  ctx: QueryCtx,
  joins: Doc<"spaceItems">[],
): Promise<Doc<"items">[]> {
  const items: Doc<"items">[] = [];
  for (const join of joins) {
    const item = await ctx.db.get(join.itemId);
    if (item !== null) {
      items.push(item);
    }
  }
  items.sort((a, b) => b._creationTime - a._creationTime);
  return items;
}

/**
 * The space's summary from its own row, or, for a legacy row the backfill has
 * not visited, a bounded recomputation. The fallback reads at most
 * SUMMARY_SCAN_LIMIT + 1 joins, so a huge legacy space shows a floor rather
 * than the exact count until `backfillSpaceCounters` runs. A query cannot
 * write, so nothing is persisted here.
 */
async function readSummary(
  ctx: QueryCtx,
  space: Doc<"spaces">,
): Promise<MembershipSummary> {
  if (hasSummary(space)) {
    return toSummaryPatch(space);
  }
  return await summarizeMemberships(ctx, space._id, SUMMARY_SCAN_LIMIT);
}

type Preview = {
  url: string;
  type: Doc<"items">["type"];
  aspectRatio?: number;
  suggested: boolean;
};

/**
 * Cover images for the spaces grid, from the previewed item ids only: at most
 * 2 * PREVIEW_LIMIT item reads per space, never a walk over the joins. Saved
 * items front the pile; a fresh space with only suggestions still gets covers
 * (sparkled client-side) instead of looking dead. Items without imagery are
 * skipped, so a space whose newest members are all notes shows fewer covers.
 */
async function loadPreviews(
  ctx: QueryCtx,
  summary: MembershipSummary,
): Promise<Preview[]> {
  const candidates = [
    ...summary.previewItemIds.map((id) => ({ id, suggested: false })),
    ...summary.suggestedPreviewItemIds.map((id) => ({ id, suggested: true })),
  ];
  const previews: Preview[] = [];
  for (const { id, suggested } of candidates) {
    if (previews.length >= PREVIEW_LIMIT) {
      break;
    }
    const item = await ctx.db.get(id);
    if (item === null) {
      continue;
    }
    if (item.storageId) {
      const url = await ctx.storage.getUrl(item.storageId);
      if (url !== null) {
        previews.push({
          url,
          type: item.type,
          aspectRatio: item.aspectRatio,
          suggested,
        });
      }
    } else if (item.heroImageUrl) {
      previews.push({
        url: item.heroImageUrl,
        type: item.type,
        aspectRatio: item.aspectRatio,
        suggested,
      });
    }
  }
  return previews;
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export const listSpaces = query({
  args: {},
  returns: v.array(
    v.object({
      ...spaceFields,
      // Saved memberships only — pending suggestions don't inflate the count.
      itemCount: v.number(),
      suggestionCount: v.number(),
      previews: v.array(
        v.object({
          url: v.string(),
          type: v.union(
            v.literal("image"),
            v.literal("link"),
            v.literal("note"),
          ),
          aspectRatio: v.optional(v.number()),
          suggested: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const spaces = await ctx.db
      .query("spaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const results = [];
    for (const space of spaces) {
      const summary = await readSummary(ctx, space);
      results.push({
        ...space,
        itemCount: summary.savedCount,
        suggestionCount: summary.suggestedCount,
        previews: await loadPreviews(ctx, summary),
      });
    }
    return results;
  },
});

export const getSpace = query({
  args: { id: v.id("spaces") },
  returns: v.union(
    v.object({
      ...spaceFields,
      // Saved items additionally carry this membership's purpose-steered
      // intents — the same item can act differently on a different shelf.
      items: v.array(
        v.object({
          ...enrichedItemValidator.fields,
          spaceIntents: v.optional(v.array(intentValidator)),
        }),
      ),
      suggestions: v.array(enrichedItemValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.id);
    if (space === null || space.userId !== userId) {
      return null;
    }
    const { saved, suggested } = await splitJoins(ctx, space._id);
    const intentsByItem = new Map(
      saved.map((join) => [join.itemId, join.intents]),
    );
    const [items, suggestions] = await Promise.all([
      loadItems(ctx, saved).then((rows) =>
        Promise.all(
          rows.map(async (item) => ({
            ...(await enrichItem(ctx, item)),
            spaceIntents: intentsByItem.get(item._id),
          })),
        ),
      ),
      loadItems(ctx, suggested).then((rows) =>
        Promise.all(rows.map((item) => enrichItem(ctx, item))),
      ),
    ]);
    return { ...space, items, suggestions };
  },
});

// ---------------------------------------------------------------------------
// Public mutations
// ---------------------------------------------------------------------------

export const createSpace = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    dynamic: v.optional(v.boolean()),
  },
  returns: v.id("spaces"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = args.name.trim();
    if (name === "") {
      throw new Error("Space name is empty");
    }

    // Onboarding replay may retry after a process death. Treat the user's
    // trimmed name as the idempotency key so a successful mutation is never
    // duplicated merely because the client did not persist its acknowledgement.
    const existing = await ctx.db
      .query("spaces")
      .withIndex("by_user_and_name", (q) =>
        q.eq("userId", userId).eq("name", name),
      )
      .take(1);
    if (existing.length > 0) {
      return existing[0]._id;
    }

    await requireProEntitlement(ctx, userId);
    // The recommendation pass is a paid model call; bound it before writing so
    // a limited caller sees no half-created space. Idempotent retries above
    // never reach this line and so never spend a token.
    await rateLimiter.limit(ctx, "recommendSpace", {
      key: userId,
      throws: true,
    });
    const spaceId = await ctx.db.insert("spaces", {
      userId,
      name,
      description: args.description,
      dynamic: args.dynamic ?? false,
      // Born with an exact (empty) summary so it never takes the legacy path.
      savedCount: 0,
      suggestedCount: 0,
      previewItemIds: [],
      suggestedPreviewItemIds: [],
    });
    // Every new space gets one recommendation pass off its title; the dynamic
    // toggle only governs whether future saves keep getting suggested.
    await ctx.scheduler.runAfter(0, internal.ai.recommendForSpace, {
      spaceId,
    });
    return spaceId;
  },
});

export const updateSpace = mutation({
  args: {
    id: v.id("spaces"),
    name: v.optional(v.string()),
    dynamic: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.id);
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    const wasDynamic = space.dynamic === true;
    const enablingDynamic = args.dynamic === true && !wasDynamic;
    // Enabling dynamic spaces is a Pro feature (the AI keeps suggesting new
    // saves into the space). A lapsed user editing a space's name or turning
    // dynamic off is allowed, but enabling it requires an active trial/pro.
    // Check BEFORE patching so a lapsed user can't flip the flag and trigger
    // the recommendation pass before being rejected. The rate limit sits in
    // the same spot for the same reason: a limited flip is rejected whole.
    if (enablingDynamic) {
      await requireProEntitlement(ctx, userId);
      await rateLimiter.limit(ctx, "recommendSpace", {
        key: userId,
        throws: true,
      });
    }
    const patch: { name?: string; dynamic?: boolean } = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name === "") {
        throw new Error("Space name is empty");
      }
      patch.name = name;
    }
    if (args.dynamic !== undefined) {
      patch.dynamic = args.dynamic;
    }
    await ctx.db.patch(space._id, patch);
    // Turning dynamic on (re-)opens the door: run a fresh recommendation pass.
    if (enablingDynamic) {
      await ctx.scheduler.runAfter(0, internal.ai.recommendForSpace, {
        spaceId: space._id,
      });
    }
    return null;
  },
});

export const deleteSpace = mutation({
  args: { id: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.id);
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    // The space row goes first so it leaves every list in this transaction.
    // Its joins follow in bounded batches; a large space finishes in a
    // scheduled continuation. Orphan joins in that window are harmless: every
    // reader null-checks the space, and the AI never suggests into a space it
    // cannot load.
    await ctx.db.delete(space._id);
    const more = await deleteMembershipsForSpace(
      ctx,
      space._id,
      SPACE_DELETE_BATCH,
    );
    if (more) {
      await ctx.scheduler.runAfter(0, internal.spaces.purgeSpaceMemberships, {
        spaceId: space._id,
      });
    }
    return null;
  },
});

/** Continuation of deleteSpace for spaces with more joins than one batch. */
export const purgeSpaceMemberships = internalMutation({
  args: { spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const more = await deleteMembershipsForSpace(
      ctx,
      args.spaceId,
      SPACE_DELETE_BATCH,
    );
    if (more) {
      await ctx.scheduler.runAfter(0, internal.spaces.purgeSpaceMemberships, {
        spaceId: args.spaceId,
      });
    }
    return null;
  },
});

/** Guard shared by the membership mutations: both ends must exist and be the caller's. */
async function requireItemAndSpace(
  ctx: MutationCtx,
  userId: string,
  itemId: Id<"items">,
  spaceId: Id<"spaces">,
): Promise<{ item: Doc<"items">; space: Doc<"spaces"> }> {
  const item = await ctx.db.get(itemId);
  if (item === null || item.userId !== userId) {
    throw new Error("Item not found");
  }
  const space = await ctx.db.get(spaceId);
  if (space === null || space.userId !== userId) {
    throw new Error("Space not found");
  }
  return { item, space };
}

/**
 * Schedule the phase-2 purpose-steering enrich pass for a ready item, and
 * report whether it was scheduled.
 *
 * Filing an item into a space is core organization and works for every
 * user; the steering pass is a paid model call and follows the same rule as
 * createSpace: Pro (or trial) only. A non-entitled user keeps the membership
 * and simply gets no steered intents. The rate limit is charged only when a
 * pass would actually run, so idle callers (item still processing, not
 * entitled) never spend a token.
 *
 * With `throws`, a limited caller aborts the whole mutation, so the
 * membership write it made is rolled back with it (matches findLinks).
 * Without it, the caller keeps its writes and just skips the pass.
 */
async function scheduleSteering(
  ctx: MutationCtx,
  userId: Id<"users">,
  item: Doc<"items">,
  spaceId: Id<"spaces">,
  options: { throws: boolean },
): Promise<boolean> {
  if (item.status !== "ready") {
    return false;
  }
  if (!(await hasProEntitlement(ctx, userId))) {
    return false;
  }
  const { ok } = await rateLimiter.limit(ctx, "steerItem", {
    key: userId,
    throws: options.throws,
  });
  if (!ok) {
    return false;
  }
  await ctx.scheduler.runAfter(0, internal.ai.steerItemForSpace, {
    itemId: item._id,
    spaceId,
  });
  return true;
}

export const addItemToSpace = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { item } = await requireItemAndSpace(
      ctx,
      userId,
      args.itemId,
      args.spaceId,
    );
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row === null) {
      await insertMembership(ctx, {
        userId,
        spaceId: args.spaceId,
        itemId: args.itemId,
        status: "saved",
      });
    } else if (effectiveStatus(row) !== "saved") {
      // A direct add upgrades a pending suggestion or overrides a dismissal.
      await setMembershipStatus(ctx, row, "saved");
    } else {
      return null;
    }
    await scheduleSteering(ctx, userId, item, args.spaceId, { throws: true });
    return null;
  },
});

export const removeItemFromSpace = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireItemAndSpace(ctx, userId, args.itemId, args.spaceId);
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row !== null && effectiveStatus(row) === "saved") {
      // Remember the user's correction so later classification cannot re-add it.
      await setMembershipStatus(ctx, row, "dismissed");
    }
    return null;
  },
});

export const acceptSuggestion = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  // True only when a live suggestion actually flipped to saved, so the client
  // fires `suggestion_accepted` on a real transition rather than a no-op re-tap.
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { item } = await requireItemAndSpace(
      ctx,
      userId,
      args.itemId,
      args.spaceId,
    );
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    // Tolerate double-taps and races: only a live suggestion flips.
    if (row === null || effectiveStatus(row) !== "suggested") {
      return false;
    }
    await setMembershipStatus(ctx, row, "saved");
    await scheduleSteering(ctx, userId, item, args.spaceId, { throws: true });
    return true;
  },
});

export const undoAcceptSuggestion = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireItemAndSpace(ctx, userId, args.itemId, args.spaceId);
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row !== null && effectiveStatus(row) === "saved") {
      await setMembershipStatus(ctx, row, "suggested");
      return true;
    }
    return false;
  },
});

export const dismissSuggestion = mutation({
  args: { itemId: v.id("items"), spaceId: v.id("spaces") },
  // True only when a live suggestion actually flipped to dismissed.
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireItemAndSpace(ctx, userId, args.itemId, args.spaceId);
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row === null || effectiveStatus(row) !== "suggested") {
      return false;
    }
    // Kept (not deleted) so the AI never nags about this item again.
    await setMembershipStatus(ctx, row, "dismissed");
    return true;
  },
});

export const acceptAllSuggestions = mutation({
  args: { spaceId: v.id("spaces") },
  // The number of suggestions actually accepted, so analytics report the real
  // count instead of whatever the client had rendered (which can be stale).
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (space === null || space.userId !== userId) {
      throw new Error("Space not found");
    }
    const { suggested } = await splitJoins(ctx, space._id);
    // Accepting is the user's decision and always lands in full. Steering is
    // best effort under the per-user budget: once the bucket runs dry the
    // remaining items are still accepted, just without a steering pass. A
    // throwing limit here would make a space with more suggestions than the
    // bucket's capacity impossible to accept at all.
    let steeringAllowed = true;
    for (const row of suggested) {
      await setMembershipStatus(ctx, row, "saved");
      if (!steeringAllowed) {
        continue;
      }
      const item = await ctx.db.get(row.itemId);
      if (item !== null && item.status === "ready") {
        steeringAllowed = await scheduleSteering(ctx, userId, item, space._id, {
          throws: false,
        });
      }
    }
    return suggested.length;
  },
});

// ---------------------------------------------------------------------------
// Internal — maintenance
// ---------------------------------------------------------------------------

/**
 * One-shot backfill of the denormalized summary on spaces written before it
 * existed. Walks `spaces` in `_id` order, at most BACKFILL_BATCH per
 * transaction, and schedules itself until done. The cursor is the id of the
 * last space fully handled, so a batch that stops early because its read
 * budget is spent resumes exactly at the next space. Each space's joins are
 * read in full (up to the smaller of BACKFILL_SCAN_LIMIT and the budget) so
 * the persisted counts are exact; a space over that ceiling is reported in
 * `skipped` and left legacy. Only
 * spaces missing a field are touched unless `force` is set, which recomputes
 * every visited space (a repair tool if the summary ever drifts).
 *
 * Run from apps/native with `npx convex run spaces:backfillSpaceCounters '{}'`
 * (add `--prod` for production). Re-running is safe: it converges.
 */
export const backfillSpaceCounters = internalMutation({
  args: {
    cursor: v.optional(v.union(v.id("spaces"), v.null())),
    batchSize: v.optional(v.number()),
    // Join rows one transaction may read across all its spaces. Lower it on
    // deployments with tighter limits; tests use it to exercise early stops.
    readBudget: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    skipped: v.array(v.id("spaces")),
    done: v.boolean(),
    cursor: v.union(v.id("spaces"), v.null()),
  }),
  handler: async (ctx, args) => {
    // Operator knobs. A batch below one would reschedule forever without
    // advancing the cursor, and a budget below two cannot fit one row plus its
    // completeness probe, so anything outside the floor uses the default.
    const batchSize = knob(args.batchSize, 1, BACKFILL_BATCH);
    const readBudget = knob(args.readBudget, 2, BACKFILL_READ_BUDGET);
    const after = args.cursor ?? null;
    // One extra row tells us whether anything follows the batch.
    const candidates = await ctx.db
      .query("spaces")
      .withIndex("by_id", (q) =>
        after === null ? q : q.gt("_id", after),
      )
      .take(batchSize + 1);
    const batch = candidates.slice(0, batchSize);
    let moreAfterBatch = candidates.length > batchSize;

    let processed = 0;
    let updated = 0;
    let remaining = readBudget;
    let cursor: Id<"spaces"> | null = after;
    const skipped: Id<"spaces">[] = [];
    for (const space of batch) {
      if (hasSummary(space) && args.force !== true) {
        processed += 1;
        cursor = space._id;
        continue;
      }
      // Every scan, including the first, stays inside the budget so one
      // transaction never reads more than the caller allowed. The first scan
      // of a transaction is judged on its own: if it comes back incomplete the
      // space is over the effective ceiling and is skipped, never retried, so
      // the loop cannot stall on it. Later scans get what is left.
      const first = remaining === readBudget;
      if (!first && remaining <= 1) {
        moreAfterBatch = true;
        break;
      }
      const scanLimit = Math.min(BACKFILL_SCAN_LIMIT, remaining - 1);
      const summary = await summarizeMemberships(ctx, space._id, scanLimit);
      remaining -= summary.scanned;
      if (!summary.complete && !first && scanLimit < BACKFILL_SCAN_LIMIT) {
        // Cut short by the budget, not by the space's size: leave the cursor
        // before this space so the continuation retries it with a full budget.
        // A later scan that still had the full ceiling and came back incomplete
        // is over the ceiling, so it falls through and is skipped like a first
        // scan would be.
        moreAfterBatch = true;
        break;
      }
      processed += 1;
      cursor = space._id;
      if (!summary.complete) {
        skipped.push(space._id);
        continue;
      }
      await ctx.db.patch(space._id, toSummaryPatch(summary));
      updated += 1;
    }
    const done = !moreAfterBatch;
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.spaces.backfillSpaceCounters, {
        cursor,
        batchSize,
        readBudget,
        force: args.force,
      });
    }
    return {
      processed,
      updated,
      skipped,
      done,
      cursor: done ? null : cursor,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal — used by the AI actions
// ---------------------------------------------------------------------------

export const listSpacesInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.array(v.object(spaceFields)),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("spaces")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getSpaceInternal = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.union(v.object(spaceFields), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.spaceId);
  },
});

/**
 * Item ids that already have any membership row for a space — the
 * recommendation pass excludes them up front so the model's picks aren't
 * wasted on items the user already filed or dismissed.
 */
export const listMemberItemIdsInternal = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.array(v.id("items")),
  handler: async (ctx, args) => {
    const joins = await ctx.db
      .query("spaceItems")
      .withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
      .collect();
    return joins.map((join) => join.itemId);
  },
});

/**
 * Ids of spaces the user has directly filed this item into. processItem uses
 * these to kick off the purpose-steering pass once classification lands (a
 * couch saved to "apartment shopping" wants a shopping link on that shelf).
 */
export const listSavedSpaceIdsForItemInternal = internalQuery({
  args: { itemId: v.id("items") },
  returns: v.array(v.id("spaces")),
  handler: async (ctx, args) => {
    const joins = await ctx.db
      .query("spaceItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
    return joins
      .filter((join) => effectiveStatus(join) === "saved")
      .map((join) => join.spaceId);
  },
});

/**
 * The steering pass's write path: intents scoped to one membership row. Only
 * `saved` rows carry them — steering never runs for pending suggestions.
 * Intents do not affect the space summary, so this is the one spaceItems
 * patch that bypasses model/memberships.ts on purpose.
 */
export const setMembershipIntentsInternal = internalMutation({
  args: {
    itemId: v.id("items"),
    spaceId: v.id("spaces"),
    intents: v.array(intentValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await getMembership(ctx, args.itemId, args.spaceId);
    if (row === null || effectiveStatus(row) !== "saved") {
      return null;
    }
    await ctx.db.patch(row._id, { intents: args.intents });
    return null;
  },
});
