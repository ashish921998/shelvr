import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { rateLimiter } from "./rateLimiter";
import { saveIntoSpace } from "./memberships";
import {
  loadItemOperation,
  parseOperationId,
  type OperationKind,
} from "./itemOperations";

type LinkOrNoteKind = Extract<OperationKind, "link" | "note">;
type LinkOrNotePayload = { url: string } | { note: string };

function validateLinkOrNotePayload(
  kind: LinkOrNoteKind,
  payload: LinkOrNotePayload,
): void {
  if (kind === "link") {
    if (
      !("url" in payload) ||
      typeof payload.url !== "string" ||
      payload.url === ""
    ) {
      throw new Error("Invalid URL");
    }
    return;
  }
  if (!("note" in payload) || payload.note.trim() === "") {
    throw new Error("Note text is empty");
  }
}

async function insertLinkOrNote(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: LinkOrNoteKind,
  payload: LinkOrNotePayload,
  spaceId?: Id<"spaces">,
): Promise<Id<"items">> {
  const itemId = await ctx.db.insert("items", {
    userId,
    type: kind,
    status: "processing",
    ...(kind === "link" && "url" in payload ? { url: payload.url } : {}),
    ...(kind === "note" && "note" in payload ? { note: payload.note } : {}),
    tags: [],
    searchText: "",
  });
  if (spaceId !== undefined) {
    await saveIntoSpace(ctx, userId, itemId, spaceId);
  }
  await ctx.scheduler.runAfter(0, internal.ai.processItem, { itemId });
  return itemId;
}

/**
 * Create a link/note with optional durable idempotency. Completed retries
 * return before rate limiting; fresh work inserts the item and ledger update
 * in one transaction and schedules AI processing exactly once.
 */
export async function createItemWithOperation(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: LinkOrNoteKind,
  payload: LinkOrNotePayload,
  options: {
    operationId?: string;
    spaceId?: Id<"spaces">;
  },
): Promise<Id<"items">> {
  const now = Date.now();
  validateLinkOrNotePayload(kind, payload);

  if (options.operationId !== undefined) {
    const operationId = parseOperationId(options.operationId);
    const operation = await loadItemOperation(ctx, userId, operationId, kind);
    if (operation !== null) {
      if (operation.status === "complete" && operation.itemId !== undefined) {
        const item = await ctx.db.get(operation.itemId);
        if (item !== null) return operation.itemId;
      }
      await ctx.db.patch(operation._id, {
        status: "pending",
        itemId: undefined,
      });
    }

    await rateLimiter.limit(ctx, "itemCreate", {
      key: userId,
      throws: true,
    });
    const itemId = await insertLinkOrNote(
      ctx,
      userId,
      kind,
      payload,
      options.spaceId,
    );
    if (operation === null) {
      await ctx.db.insert("itemOperations", {
        userId,
        operationId,
        kind,
        status: "complete",
        itemId,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(operation._id, {
        status: "complete",
        itemId,
        updatedAt: now,
      });
    }
    return itemId;
  }

  await rateLimiter.limit(ctx, "itemCreate", { key: userId, throws: true });
  return await insertLinkOrNote(ctx, userId, kind, payload, options.spaceId);
}
