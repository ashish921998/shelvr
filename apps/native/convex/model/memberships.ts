import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type MembershipStatus = "suggested" | "saved" | "dismissed";

/** How many item ids each preview bucket on the space row keeps. */
export const PREVIEW_LIMIT = 3;

/**
 * Upper bound on join rows read by any single-space summary that runs on a
 * hot path: the listSpaces fallback for legacy rows, and the helper's
 * self-heal when a legacy space takes its first write. Spaces with more joins
 * than this stay legacy until `spaces:backfillSpaceCounters` runs.
 */
export const SUMMARY_SCAN_LIMIT = 50;

/**
 * A spaceItems row's effective state. Rows written before the suggestion
 * model existed have no `status` — they were real memberships, so they read
 * as "saved".
 */
export function effectiveStatus(row: Doc<"spaceItems">): MembershipStatus {
  return row.status ?? "saved";
}

/** The single membership row joining an item to a space, if any. */
export async function getMembership(
  ctx: QueryCtx,
  itemId: Id<"items">,
  spaceId: Id<"spaces">,
): Promise<Doc<"spaceItems"> | null> {
  // The pair is unique by construction (every insert goes through
  // insertMembership after a lookup here), so the compound index lands on the
  // one row without scanning the item's other spaces. `.first()` rather than
  // `.unique()` so a duplicate left by old data degrades to the oldest row
  // instead of failing every action on the pair.
  return await ctx.db
    .query("spaceItems")
    .withIndex("by_item_and_space", (q) =>
      q.eq("itemId", itemId).eq("spaceId", spaceId),
    )
    .first();
}

// ---------------------------------------------------------------------------
// Denormalized space summary
// ---------------------------------------------------------------------------
//
// `spaces.savedCount`, `spaces.suggestedCount`, `spaces.previewItemIds` and
// `spaces.suggestedPreviewItemIds` are maintained here and nowhere else. The
// invariant is: after any mutation that touches spaceItems commits, each
// counter equals the number of that space's rows with that effective status,
// and each preview list holds the ids of up to PREVIEW_LIMIT of those rows,
// newest first. "Newest" is exact for incremental adds (the id is prepended)
// and approximated by join creation time when a list is refilled after a
// cover item leaves, so a suggestion accepted long after it was suggested may
// sit lower after a refill than before. Counts are always exact. Because
// Convex mutations are serializable transactions, two concurrent adds to the
// same space cannot both read count N and write N+1: one is retried and sees
// N+1.
//
// The summary fields are optional so rows written before they existed stay
// valid. Such a "legacy" space is healed on its first write if it is small
// enough to summarize within SUMMARY_SCAN_LIMIT; larger ones wait for the
// backfill. Until then listSpaces computes a bounded fallback.

/** Statuses that are counted and previewed. Dismissed rows are invisible. */
type CountedStatus = "saved" | "suggested";

export type MembershipSummary = {
  savedCount: number;
  suggestedCount: number;
  previewItemIds: Id<"items">[];
  suggestedPreviewItemIds: Id<"items">[];
};

/** True when the row carries all four denormalized fields. */
export function hasSummary(
  space: Doc<"spaces">,
): space is Doc<"spaces"> & MembershipSummary {
  return (
    space.savedCount !== undefined &&
    space.suggestedCount !== undefined &&
    space.previewItemIds !== undefined &&
    space.suggestedPreviewItemIds !== undefined
  );
}

/**
 * Compute the summary from the join rows, reading the most recent
 * `scanLimit + 1` of them. `complete` is false when the space has more rows
 * than `scanLimit`; the counts are then a floor, not the truth, and callers
 * must not persist them. `scanned` is the number of rows actually read, so a
 * caller that visits many spaces in one transaction can budget its reads.
 */
export async function summarizeMemberships(
  ctx: QueryCtx,
  spaceId: Id<"spaces">,
  scanLimit: number,
): Promise<MembershipSummary & { complete: boolean; scanned: number }> {
  const joins = await ctx.db
    .query("spaceItems")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .order("desc")
    .take(scanLimit + 1);
  const complete = joins.length <= scanLimit;
  const summary: MembershipSummary = {
    savedCount: 0,
    suggestedCount: 0,
    previewItemIds: [],
    suggestedPreviewItemIds: [],
  };
  for (const join of joins.slice(0, scanLimit)) {
    const status = effectiveStatus(join);
    if (status === "saved") {
      summary.savedCount += 1;
      if (summary.previewItemIds.length < PREVIEW_LIMIT) {
        summary.previewItemIds.push(join.itemId);
      }
    } else if (status === "suggested") {
      summary.suggestedCount += 1;
      if (summary.suggestedPreviewItemIds.length < PREVIEW_LIMIT) {
        summary.suggestedPreviewItemIds.push(join.itemId);
      }
    }
  }
  return { ...summary, complete, scanned: joins.length };
}

/**
 * The newest `PREVIEW_LIMIT` item ids in one status bucket, read through
 * `by_space_and_status` so rows of other statuses are never scanned. A space
 * that accumulates hundreds of dismissed rows therefore cannot push its saved
 * rows out of a bounded scan and leave the preview empty while the count is
 * positive. Legacy rows store no `status` yet read as saved, so the saved
 * bucket merges the explicit and the absent key.
 */
export async function previewItemIdsForStatus(
  ctx: QueryCtx,
  spaceId: Id<"spaces">,
  status: CountedStatus,
): Promise<Id<"items">[]> {
  const keys: (MembershipStatus | undefined)[] =
    status === "saved" ? ["saved", undefined] : ["suggested"];
  const rows: Doc<"spaceItems">[] = [];
  for (const key of keys) {
    const page = await ctx.db
      .query("spaceItems")
      .withIndex("by_space_and_status", (q) =>
        q.eq("spaceId", spaceId).eq("status", key),
      )
      .order("desc")
      .take(PREVIEW_LIMIT);
    rows.push(...page);
  }
  rows.sort((a, b) => b._creationTime - a._creationTime);
  return rows.slice(0, PREVIEW_LIMIT).map((row) => row.itemId);
}

/** The four persisted fields of a summary, without the `complete` marker. */
export function toSummaryPatch(summary: MembershipSummary): MembershipSummary {
  return {
    savedCount: summary.savedCount,
    suggestedCount: summary.suggestedCount,
    previewItemIds: summary.previewItemIds,
    suggestedPreviewItemIds: summary.suggestedPreviewItemIds,
  };
}

function countField(status: CountedStatus): "savedCount" | "suggestedCount" {
  return status === "saved" ? "savedCount" : "suggestedCount";
}

function previewField(
  status: CountedStatus,
): "previewItemIds" | "suggestedPreviewItemIds" {
  return status === "saved" ? "previewItemIds" : "suggestedPreviewItemIds";
}

function isCounted(status: MembershipStatus | null): status is CountedStatus {
  return status === "saved" || status === "suggested";
}

/**
 * Apply one row's transition `from -> to` (null = no row) to the space's
 * summary. Must run AFTER the row write in the same mutation so any refill
 * scan sees the new state. A space that no longer exists is a no-op: the
 * account purge and deleteSpace drop the parent first, and orphan joins are
 * tolerated by every reader.
 */
async function applyTransition(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  itemId: Id<"items">,
  from: MembershipStatus | null,
  to: MembershipStatus | null,
): Promise<void> {
  if (from === to) {
    return;
  }
  const space = await ctx.db.get(spaceId);
  if (space === null) {
    return;
  }
  if (!hasSummary(space)) {
    // Legacy row: no deltas to apply. Heal it now if it is small; otherwise
    // leave every field undefined so the backfill (which reads everything)
    // computes the truth instead of us persisting a capped floor.
    const summary = await summarizeMemberships(
      ctx,
      spaceId,
      SUMMARY_SCAN_LIMIT,
    );
    if (summary.complete) {
      await ctx.db.patch(spaceId, toSummaryPatch(summary));
    }
    return;
  }

  const patch: Partial<MembershipSummary> = {};
  const refill: CountedStatus[] = [];
  if (isCounted(from)) {
    patch[countField(from)] = Math.max(0, space[countField(from)] - 1);
    const list = space[previewField(from)];
    if (list.includes(itemId)) {
      patch[previewField(from)] = list.filter((id) => id !== itemId);
      refill.push(from);
    }
  }
  if (isCounted(to)) {
    patch[countField(to)] = space[countField(to)] + 1;
    const list = patch[previewField(to)] ?? space[previewField(to)];
    patch[previewField(to)] = [itemId, ...list.filter((id) => id !== itemId)].slice(
      0,
      PREVIEW_LIMIT,
    );
  }
  // A bucket that lost a previewed member may still have more rows than the
  // shortened list shows; top it up from that bucket alone. This is the only
  // path that reads join rows, and it runs only on removals of a cover item.
  for (const status of refill) {
    const count = patch[countField(status)] ?? space[countField(status)];
    const list = patch[previewField(status)] ?? space[previewField(status)];
    if (list.length < PREVIEW_LIMIT && count > list.length) {
      patch[previewField(status)] = await previewItemIdsForStatus(
        ctx,
        spaceId,
        status,
      );
    }
  }
  await ctx.db.patch(spaceId, patch);
}

// ---------------------------------------------------------------------------
// The write paths. Every insert/patch/delete of a spaceItems row goes
// through one of these so the space summary is updated in the same
// transaction.
// ---------------------------------------------------------------------------

/** Insert a new join row. Callers must have checked no row exists for the pair. */
export async function insertMembership(
  ctx: MutationCtx,
  args: {
    userId: string;
    spaceId: Id<"spaces">;
    itemId: Id<"items">;
    status: MembershipStatus;
  },
): Promise<Id<"spaceItems">> {
  const id = await ctx.db.insert("spaceItems", args);
  await applyTransition(ctx, args.spaceId, args.itemId, null, args.status);
  return id;
}

/**
 * Move a row to a new status. Intents are purpose-steered for a `saved`
 * membership only, so leaving `saved` always drops them; re-entering `saved`
 * starts with none until the steering pass writes fresh ones.
 */
export async function setMembershipStatus(
  ctx: MutationCtx,
  row: Doc<"spaceItems">,
  status: MembershipStatus,
): Promise<void> {
  const from = effectiveStatus(row);
  if (status === "saved") {
    await ctx.db.patch(row._id, { status });
  } else {
    await ctx.db.patch(row._id, { status, intents: undefined });
  }
  await applyTransition(ctx, row.spaceId, row.itemId, from, status);
}

/** Delete one join row and release its slot in the space summary. */
export async function deleteMembership(
  ctx: MutationCtx,
  row: Doc<"spaceItems">,
): Promise<void> {
  await ctx.db.delete(row._id);
  await applyTransition(
    ctx,
    row.spaceId,
    row.itemId,
    effectiveStatus(row),
    null,
  );
}

/**
 * Item delete: drop the item from every space and fix each space's counts
 * and covers. Bounded by the number of spaces the user owns.
 */
export async function deleteMembershipsForItem(
  ctx: MutationCtx,
  itemId: Id<"items">,
): Promise<void> {
  const joins = await ctx.db
    .query("spaceItems")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .collect();
  for (const join of joins) {
    await deleteMembership(ctx, join);
  }
}

/**
 * Space delete: remove up to `limit` of the space's join rows. Returns true
 * when more remain, so the caller can continue in a fresh transaction. The
 * summary is not touched — the caller deletes the space row itself, and the
 * fields die with it.
 */
export async function deleteMembershipsForSpace(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  limit: number,
): Promise<boolean> {
  const joins = await ctx.db
    .query("spaceItems")
    .withIndex("by_space", (q) => q.eq("spaceId", spaceId))
    .take(limit + 1);
  for (const join of joins.slice(0, limit)) {
    await ctx.db.delete(join._id);
  }
  return joins.length > limit;
}
