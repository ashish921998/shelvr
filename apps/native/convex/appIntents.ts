import { v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { liveOwner, requireUserId } from "./model/auth";
import { normalizeExternalUrl } from "./model/externalUrl";
import { IMAGE_EMPTY_MESSAGE } from "./model/imagePolicy";
import {
  MAX_CAPTURE_TOKEN_LENGTH,
  newCaptureToken,
  sha256Hex,
} from "./model/captureTokens";
import {
  attachImageUploadForUser,
  beginImageImportForUser,
  createItemWithOperation,
  finalizeImageImportForUser,
} from "./items";
import { requireProEntitlement } from "./subscriptions";
import { rateLimiter } from "./model/rateLimiter";

export const authorizeCaptureBody = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { tokenHash }) => {
    const token = await claimCaptureToken(ctx, tokenHash);
    if (!token) return false;
    await rateLimiter.limit(ctx, "captureBody", {
      key: token.userId,
      throws: true,
    });
    return true;
  },
});

export const MAX_CAPTURE_TOKENS_PER_USER = 5;

const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000;

const MAX_CAPTURE_CONTEXT_LENGTH = 8000;

export const issueCaptureToken = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const token = newCaptureToken();
    await ctx.runMutation(internal.appIntents.storeCaptureToken, {
      tokenHash: await sha256Hex(token),
    });
    return token;
  },
});

export const storeCaptureToken = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await ctx.db.insert("captureTokens", {
      userId,
      tokenHash: args.tokenHash,
      createdAt: Date.now(),
    });
    const tokens = await ctx.db
      .query("captureTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    for (const stale of tokens.slice(MAX_CAPTURE_TOKENS_PER_USER)) {
      await ctx.db.delete(stale._id);
    }
    return null;
  },
});

export const revokeCaptureToken = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (
      args.token.length === 0 ||
      args.token.length > MAX_CAPTURE_TOKEN_LENGTH
    ) {
      return null;
    }
    const tokenHash = await sha256Hex(args.token);
    const row = await ctx.db
      .query("captureTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (row !== null && row.userId === userId) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

async function claimCaptureToken(
  ctx: MutationCtx,
  tokenHash: string,
): Promise<Doc<"captureTokens"> | null> {
  const token = await ctx.db
    .query("captureTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (token === null) return null;
  if ((await liveOwner(ctx, token.userId)) === null) return null;
  const now = Date.now();
  if (
    token.lastUsedAt === undefined ||
    now - token.lastUsedAt > LAST_USED_RESOLUTION_MS
  ) {
    await ctx.db.patch(token._id, { lastUsedAt: now });
  }
  return token;
}

async function ownedSpaceId(
  ctx: MutationCtx,
  userId: Id<"users">,
  spaceId: string | undefined,
): Promise<Id<"spaces"> | undefined> {
  if (spaceId === undefined) return undefined;
  const id = ctx.db.normalizeId("spaces", spaceId);
  if (id === null) return undefined;
  const space = await ctx.db.get(id);
  return space !== null && space.userId === userId ? id : undefined;
}

function trimContext(context: string | undefined): string | undefined {
  const trimmed = context?.trim().slice(0, MAX_CAPTURE_CONTEXT_LENGTH);
  return trimmed === "" ? undefined : trimmed;
}

const unauthorized = v.object({ kind: v.literal("unauthorized") });

export const beginImageCapture = internalMutation({
  args: { tokenHash: v.string(), operationId: v.string() },
  returns: v.union(
    unauthorized,
    v.object({ kind: v.literal("upload"), uploadUrl: v.string() }),
    v.object({ kind: v.literal("complete"), itemId: v.id("items") }),
  ),
  handler: async (ctx, args) => {
    const token = await claimCaptureToken(ctx, args.tokenHash);
    if (token === null) return { kind: "unauthorized" as const };
    return await beginImageImportForUser(ctx, token.userId, args.operationId);
  },
});

export const attachImageCapture = internalMutation({
  args: {
    tokenHash: v.string(),
    operationId: v.string(),
    storageId: v.string(),
  },
  returns: v.union(
    unauthorized,
    v.object({ kind: v.literal("attached") }),
    v.object({
      kind: v.literal("rejected"),
      error: v.union(
        v.literal("image_empty"),
        v.literal("image_too_large"),
        v.literal("bad_request"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const token = await claimCaptureToken(ctx, args.tokenHash);
    if (token === null) return { kind: "unauthorized" as const };
    const storageId = ctx.db.system.normalizeId("_storage", args.storageId);
    if (storageId === null) {
      return { kind: "rejected" as const, error: "bad_request" as const };
    }
    const result = await attachImageUploadForUser(ctx, token.userId, {
      operationId: args.operationId,
      storageId,
    });
    if (result.error === undefined) return { kind: "attached" as const };
    return {
      kind: "rejected" as const,
      error:
        result.error === IMAGE_EMPTY_MESSAGE
          ? ("image_empty" as const)
          : ("image_too_large" as const),
    };
  },
});

export const finalizeImageCapture = internalMutation({
  args: {
    tokenHash: v.string(),
    operationId: v.string(),
    aspectRatio: v.optional(v.number()),
    isSticker: v.optional(v.boolean()),
    spaceId: v.optional(v.string()),
    captureContext: v.optional(v.string()),
  },
  returns: v.union(
    unauthorized,
    v.object({ kind: v.literal("saved"), itemId: v.id("items") }),
  ),
  handler: async (ctx, args) => {
    const token = await claimCaptureToken(ctx, args.tokenHash);
    if (token === null) return { kind: "unauthorized" as const };
    const itemId = await finalizeImageImportForUser(ctx, token.userId, {
      operationId: args.operationId,
      saveSource: "siri",
      aspectRatio: args.aspectRatio,
      isSticker: args.isSticker,
      spaceId: await ownedSpaceId(ctx, token.userId, args.spaceId),
      captureContext:
        args.isSticker === true ? undefined : trimContext(args.captureContext),
    });
    return { kind: "saved" as const, itemId };
  },
});

export const captureLinkOrNote = internalMutation({
  args: {
    tokenHash: v.string(),
    operationId: v.string(),
    kind: v.union(v.literal("link"), v.literal("note")),
    text: v.optional(v.string()),
    url: v.optional(v.string()),
    spaceId: v.optional(v.string()),
  },
  returns: v.union(
    unauthorized,
    v.object({ kind: v.literal("saved"), itemId: v.id("items") }),
  ),
  handler: async (ctx, args) => {
    const token = await claimCaptureToken(ctx, args.tokenHash);
    if (token === null) return { kind: "unauthorized" as const };
    const userId = token.userId;
    await requireProEntitlement(ctx, userId);
    const options = {
      operationId: args.operationId,
      spaceId: await ownedSpaceId(ctx, userId, args.spaceId),
      saveSource: "siri" as const,
    };
    const itemId =
      args.kind === "link"
        ? await createItemWithOperation(
            ctx,
            userId,
            "link",
            { url: normalizeExternalUrl(args.url ?? "") },
            options,
          )
        : await createItemWithOperation(
            ctx,
            userId,
            "note",
            { note: args.text ?? "" },
            options,
          );
    return { kind: "saved" as const, itemId };
  },
});
