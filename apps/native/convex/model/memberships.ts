import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type MembershipStatus = "suggested" | "saved" | "dismissed";

export const PREVIEW_LIMIT = 3;

export const SUMMARY_SCAN_LIMIT = 50;

export function effectiveStatus(row: Doc<"spaceItems">): MembershipStatus {
  return row.status ?? "saved";
}

export async function getMembership(
  ctx: QueryCtx,
  itemId: Id<"items">,
  spaceId: Id<"spaces">,
): Promise<Doc<"spaceItems"> | null> {
  return await ctx.db
    .query("spaceItems")
    .withIndex("by_item_and_space", (q) =>
      q.eq("itemId", itemId).eq("spaceId", spaceId),
    )
    .first();
}

type CountedStatus = "saved" | "suggested";

export type MembershipSummary = {
  savedCount: number;
  suggestedCount: number;
  previewItemIds: Id<"items">[];
  suggestedPreviewItemIds: Id<"items">[];
};

export function emptySummary(): MembershipSummary {
  return {
    savedCount: 0,
    suggestedCount: 0,
    previewItemIds: [],
    suggestedPreviewItemIds: [],
  };
}

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
  const summary = emptySummary();
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

async function previewItemIdsForStatus(
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
    patch[previewField(to)] = [
      itemId,
      ...list.filter((id) => id !== itemId),
    ].slice(0, PREVIEW_LIMIT);
  }
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

/** A place steered onto a save through this space may be its only source; recheck its pins. */
async function refreshPinsFor(
  ctx: MutationCtx,
  row: Doc<"spaceItems">,
): Promise<void> {
  if ((row.intents ?? []).some((intent) => intent.kind === "open_maps")) {
    await ctx.scheduler.runAfter(0, internal.placePins.locateItem, {
      itemId: row.itemId,
    });
  }
}

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
    await refreshPinsFor(ctx, row);
  }
  await applyTransition(ctx, row.spaceId, row.itemId, from, status);
}

export async function deleteMembership(
  ctx: MutationCtx,
  row: Doc<"spaceItems">,
): Promise<void> {
  await ctx.db.delete(row._id);
  await refreshPinsFor(ctx, row);
  await applyTransition(
    ctx,
    row.spaceId,
    row.itemId,
    effectiveStatus(row),
    null,
  );
}

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
    await refreshPinsFor(ctx, join);
  }
  return joins.length > limit;
}
