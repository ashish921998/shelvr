import { v } from "convex/values";
import { importPKCS8, SignJWT } from "jose";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  env,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { currentUser, membership } from "./model/access";
import { muxKeyToPkcs8Pem } from "./model/muxKey";

const TOKEN_TTL_SECONDS = 6 * 60 * 60;

export const uploadTarget = internalQuery({
  args: { mediaId: v.id("media") },
  returns: v.union(v.null(), v.object({ campaignId: v.id("campaigns") })),
  handler: async (ctx, { mediaId }) => {
    const user = await currentUser(ctx);
    const media = await ctx.db.get("media", mediaId);
    if (user === null || media === null) return null;
    if (media.uploaderId !== user._id) return null;
    if (media.status !== "waiting" || media.muxUploadId) return null;
    return { campaignId: media.campaignId };
  },
});

export const recordUpload = internalMutation({
  args: { mediaId: v.id("media"), muxUploadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { mediaId, muxUploadId }) => {
    await ctx.db.patch("media", mediaId, { muxUploadId });
    return null;
  },
});

export const playable = internalQuery({
  args: { mediaIds: v.array(v.id("media")) },
  returns: v.array(
    v.object({ mediaId: v.id("media"), playbackId: v.string() }),
  ),
  handler: async (ctx, { mediaIds }) => {
    const user = await currentUser(ctx);
    if (user === null) return [];
    const allowed = new Map<Id<"campaigns">, boolean>();
    const result = [];
    for (const mediaId of mediaIds.slice(0, 100)) {
      const media = await ctx.db.get("media", mediaId);
      if (!media?.playbackId) continue;
      if (!allowed.has(media.campaignId)) {
        const member = await membership(ctx, media.campaignId, user._id);
        allowed.set(media.campaignId, member !== null);
      }
      if (allowed.get(media.campaignId)) {
        result.push({ mediaId, playbackId: media.playbackId });
      }
    }
    return result;
  },
});

export const applyMuxEvent = internalMutation({
  args: {
    mediaId: v.string(),
    kind: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("errored"),
    ),
    assetId: v.optional(v.string()),
    playbackId: v.optional(v.string()),
    duration: v.optional(v.number()),
    aspectRatio: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const mediaId = ctx.db.normalizeId("media", args.mediaId);
    if (mediaId === null) return null;
    const media = await ctx.db.get("media", mediaId);
    if (media === null) return null;
    if (args.kind === "processing") {
      if (media.status === "waiting") {
        await ctx.db.patch("media", mediaId, {
          status: "processing",
          muxAssetId: args.assetId,
        });
      }
      return null;
    }
    if (args.kind === "ready") {
      await ctx.db.patch("media", mediaId, {
        status: "ready",
        muxAssetId: args.assetId,
        playbackId: args.playbackId,
        duration: args.duration,
        aspectRatio: args.aspectRatio,
      });
      return null;
    }
    await ctx.db.patch("media", mediaId, { status: "errored" });
    return null;
  },
});

function muxAuthHeader(): string {
  const id = env.MUX_TOKEN_ID;
  const secret = env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new Error("Mux is not set up yet");
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

export const createUpload = action({
  args: { mediaId: v.id("media") },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, { mediaId }) => {
    const target = await ctx.runQuery(internal.media.uploadTarget, { mediaId });
    if (target === null) throw new Error("This upload is not yours to start");
    const response = await fetch("https://api.mux.com/video/v1/uploads", {
      method: "POST",
      headers: {
        Authorization: muxAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cors_origin: env.SITE_URL ?? "*",
        new_asset_settings: {
          playback_policies: ["signed"],
          passthrough: mediaId,
          video_quality: "basic",
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Mux refused the upload (${response.status})`);
    }
    const json = (await response.json()) as {
      data?: { id?: string; url?: string };
    };
    const id = json.data?.id;
    const url = json.data?.url;
    if (!id || !url) throw new Error("Mux sent back no upload URL");
    await ctx.runMutation(internal.media.recordUpload, {
      mediaId,
      muxUploadId: id,
    });
    return { url };
  },
});

export const playbackTokens = action({
  args: { mediaIds: v.array(v.id("media")) },
  returns: v.array(
    v.object({
      mediaId: v.id("media"),
      playbackId: v.string(),
      playback: v.string(),
      thumbnail: v.string(),
      storyboard: v.string(),
    }),
  ),
  handler: async (
    ctx,
    { mediaIds },
  ): Promise<
    {
      mediaId: Id<"media">;
      playbackId: string;
      playback: string;
      thumbnail: string;
      storyboard: string;
    }[]
  > => {
    const rows: { mediaId: Id<"media">; playbackId: string }[] =
      await ctx.runQuery(internal.media.playable, { mediaIds });
    if (rows.length === 0) return [];
    const keyId = env.MUX_SIGNING_KEY_ID;
    const secret = env.MUX_SIGNING_PRIVATE_KEY;
    if (!keyId || !secret) throw new Error("Mux signing is not set up yet");
    const key = await importPKCS8(muxKeyToPkcs8Pem(secret), "RS256");
    const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const sign = (playbackId: string, audience: string) =>
      new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: keyId })
        .setSubject(playbackId)
        .setAudience(audience)
        .setExpirationTime(expires)
        .sign(key);
    return await Promise.all(
      rows.map(async ({ mediaId, playbackId }) => ({
        mediaId,
        playbackId,
        playback: await sign(playbackId, "v"),
        thumbnail: await sign(playbackId, "t"),
        storyboard: await sign(playbackId, "s"),
      })),
    );
  },
});
