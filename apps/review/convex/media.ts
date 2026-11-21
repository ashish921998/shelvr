import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  env,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { currentUser, membership } from "./model/access";
import {
  aspectRatio,
  cleanContentType,
  headObject,
  MAX_UPLOAD_BYTES,
  mediaKey,
  presign,
  type R2Config,
} from "./model/storage";

const UPLOAD_TTL_SECONDS = 60 * 60;
const PLAYBACK_TTL_SECONDS = 6 * 60 * 60;

function r2Config(): R2Config {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Video storage is not set up yet");
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export const uploadTarget = internalQuery({
  args: { mediaId: v.id("media") },
  returns: v.union(
    v.null(),
    v.object({ storageKey: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { mediaId }) => {
    const user = await currentUser(ctx);
    const media = await ctx.db.get("media", mediaId);
    if (user === null || media === null) return null;
    if (media.uploaderId !== user._id) return null;
    if (media.status !== "waiting") return null;
    return { storageKey: media.storageKey ?? null };
  },
});

export const recordUpload = internalMutation({
  args: {
    mediaId: v.id("media"),
    storageKey: v.string(),
    contentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { mediaId, storageKey, contentType }) => {
    await ctx.db.patch("media", mediaId, { storageKey, contentType });
    return null;
  },
});

export const markReady = internalMutation({
  args: {
    mediaId: v.id("media"),
    size: v.number(),
    duration: v.optional(v.number()),
    aspectRatio: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.status !== "waiting") return null;
    await ctx.db.patch("media", args.mediaId, {
      status: "ready",
      size: args.size,
      duration: args.duration,
      aspectRatio: args.aspectRatio,
    });
    return null;
  },
});

export const markErrored = internalMutation({
  args: { mediaId: v.id("media") },
  returns: v.null(),
  handler: async (ctx, { mediaId }) => {
    const media = await ctx.db.get("media", mediaId);
    if (media === null || media.status !== "waiting") return null;
    await ctx.db.patch("media", mediaId, { status: "errored" });
    return null;
  },
});

export const playable = internalQuery({
  args: { mediaIds: v.array(v.id("media")) },
  returns: v.array(
    v.object({ mediaId: v.id("media"), storageKey: v.string() }),
  ),
  handler: async (ctx, { mediaIds }) => {
    const user = await currentUser(ctx);
    if (user === null) return [];
    const allowed = new Map<Id<"campaigns">, boolean>();
    const result = [];
    for (const mediaId of mediaIds.slice(0, 100)) {
      const media = await ctx.db.get("media", mediaId);
      if (media?.status !== "ready" || !media.storageKey) continue;
      if (!allowed.has(media.campaignId)) {
        const member = await membership(ctx, media.campaignId, user._id);
        allowed.set(media.campaignId, member !== null);
      }
      if (allowed.get(media.campaignId)) {
        result.push({ mediaId, storageKey: media.storageKey });
      }
    }
    return result;
  },
});

export const createUpload = action({
  args: { mediaId: v.id("media"), contentType: v.string() },
  returns: v.object({ url: v.string(), contentType: v.string() }),
  handler: async (ctx, { mediaId, contentType }) => {
    const target = await ctx.runQuery(internal.media.uploadTarget, { mediaId });
    if (target === null) throw new Error("This upload is not yours to start");
    const type = cleanContentType(contentType);
    const config = r2Config();
    const storageKey = target.storageKey ?? mediaKey(mediaId);
    await ctx.runMutation(internal.media.recordUpload, {
      mediaId,
      storageKey,
      contentType: type,
    });
    const url = await presign(config, {
      key: storageKey,
      method: "PUT",
      expiresIn: UPLOAD_TTL_SECONDS,
      contentType: type,
    });
    return { url, contentType: type };
  },
});

export const completeUpload = action({
  args: {
    mediaId: v.id("media"),
    duration: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  returns: v.union(v.literal("ready"), v.literal("errored")),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.media.uploadTarget, {
      mediaId: args.mediaId,
    });
    if (target === null || target.storageKey === null) {
      throw new Error("This upload is not yours to finish");
    }
    const head = await headObject(r2Config(), target.storageKey);
    if (head === null || head.size === 0 || head.size > MAX_UPLOAD_BYTES) {
      await ctx.runMutation(internal.media.markErrored, {
        mediaId: args.mediaId,
      });
      return "errored";
    }
    const duration =
      args.duration !== undefined &&
      Number.isFinite(args.duration) &&
      args.duration > 0
        ? args.duration
        : undefined;
    await ctx.runMutation(internal.media.markReady, {
      mediaId: args.mediaId,
      size: head.size,
      duration,
      aspectRatio:
        args.width !== undefined && args.height !== undefined
          ? aspectRatio(args.width, args.height)
          : undefined,
    });
    return "ready";
  },
});

export const playbackTokens = action({
  args: { mediaIds: v.array(v.id("media")) },
  returns: v.array(v.object({ mediaId: v.id("media"), url: v.string() })),
  handler: async (
    ctx,
    { mediaIds },
  ): Promise<{ mediaId: Id<"media">; url: string }[]> => {
    const rows: { mediaId: Id<"media">; storageKey: string }[] =
      await ctx.runQuery(internal.media.playable, { mediaIds });
    if (rows.length === 0) return [];
    const config = r2Config();
    return await Promise.all(
      rows.map(async ({ mediaId, storageKey }) => ({
        mediaId,
        url: await presign(config, {
          key: storageKey,
          method: "GET",
          expiresIn: PLAYBACK_TTL_SECONDS,
        }),
      })),
    );
  },
});
