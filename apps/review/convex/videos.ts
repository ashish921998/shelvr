import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { displayName, requireMember, viewerRole } from "./model/access";
import {
  canSetStatus,
  canUploadVersion,
  cleanText,
  MAX_BODY,
  MAX_TITLE,
} from "./model/rules";
import {
  mediaStatusValidator,
  reviewStatusValidator,
  roleValidator,
} from "./schema";

const mediaView = v.object({
  _id: v.id("media"),
  status: mediaStatusValidator,
  duration: v.union(v.number(), v.null()),
  aspectRatio: v.union(v.string(), v.null()),
});

function viewMedia(media: Doc<"media"> | null) {
  if (media === null) return null;
  return {
    _id: media._id,
    status: media.status,
    duration: media.duration ?? null,
    aspectRatio: media.aspectRatio ?? null,
  };
}

async function newMedia(
  ctx: MutationCtx,
  campaignId: Id<"campaigns">,
  uploaderId: Id<"users">,
): Promise<Id<"media">> {
  return await ctx.db.insert("media", {
    campaignId,
    uploaderId,
    status: "waiting",
  });
}

async function latestVersion(
  ctx: QueryCtx,
  video: Doc<"videos">,
): Promise<Doc<"versions"> | null> {
  return await ctx.db
    .query("versions")
    .withIndex("by_videoId_and_number", (q) =>
      q.eq("videoId", video._id).eq("number", video.latestVersion),
    )
    .unique();
}

export const list = query({
  args: { campaignId: v.id("campaigns") },
  returns: v.array(
    v.object({
      _id: v.id("videos"),
      title: v.string(),
      status: reviewStatusValidator,
      creatorName: v.string(),
      isMine: v.boolean(),
      latestVersion: v.number(),
      updatedAt: v.number(),
      media: v.union(v.null(), mediaView),
    }),
  ),
  handler: async (ctx, { campaignId }) => {
    const viewer = await viewerRole(ctx, campaignId);
    if (viewer === null) return [];
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_campaignId_and_updatedAt", (q) =>
        q.eq("campaignId", campaignId),
      )
      .order("desc")
      .take(200);
    const rows = [];
    for (const video of videos) {
      const creator = await ctx.db.get("users", video.creatorId);
      const version = await latestVersion(ctx, video);
      const media = version ? await ctx.db.get("media", version.mediaId) : null;
      rows.push({
        _id: video._id,
        title: video.title,
        status: video.status,
        creatorName: displayName(creator),
        isMine: video.creatorId === viewer.user._id,
        latestVersion: video.latestVersion,
        updatedAt: video.updatedAt,
        media: viewMedia(media),
      });
    }
    return rows;
  },
});

export const get = query({
  args: { videoId: v.id("videos") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("videos"),
      title: v.string(),
      status: reviewStatusValidator,
      campaignId: v.id("campaigns"),
      campaignName: v.string(),
      creatorName: v.string(),
      role: roleValidator,
      canReview: v.boolean(),
      canUpload: v.boolean(),
      versions: v.array(
        v.object({
          _id: v.id("versions"),
          number: v.number(),
          note: v.union(v.string(), v.null()),
          uploadedAt: v.number(),
          media: v.union(v.null(), mediaView),
        }),
      ),
    }),
  ),
  handler: async (ctx, { videoId }) => {
    const video = await ctx.db.get("videos", videoId);
    if (video === null) return null;
    const viewer = await viewerRole(ctx, video.campaignId);
    const campaign = await ctx.db.get("campaigns", video.campaignId);
    if (viewer === null || campaign === null) return null;
    const creator = await ctx.db.get("users", video.creatorId);
    const versionRows = await ctx.db
      .query("versions")
      .withIndex("by_videoId_and_number", (q) => q.eq("videoId", videoId))
      .order("desc")
      .take(100);
    const versions = [];
    for (const version of versionRows) {
      versions.push({
        _id: version._id,
        number: version.number,
        note: version.note ?? null,
        uploadedAt: version._creationTime,
        media: viewMedia(await ctx.db.get("media", version.mediaId)),
      });
    }
    return {
      _id: video._id,
      title: video.title,
      status: video.status,
      campaignId: video.campaignId,
      campaignName: campaign.name,
      creatorName: displayName(creator),
      role: viewer.role,
      canReview: canSetStatus(viewer.role),
      canUpload: canUploadVersion(
        viewer.role,
        video.creatorId === viewer.user._id,
      ),
      versions,
    };
  },
});

export const create = mutation({
  args: { campaignId: v.id("campaigns"), title: v.string() },
  returns: v.object({ videoId: v.id("videos"), mediaId: v.id("media") }),
  handler: async (ctx, { campaignId, title }) => {
    const { user } = await requireMember(ctx, campaignId);
    const clean = cleanText(title, MAX_TITLE) || "Untitled video";
    const mediaId = await newMedia(ctx, campaignId, user._id);
    const now = Date.now();
    const videoId = await ctx.db.insert("videos", {
      campaignId,
      creatorId: user._id,
      title: clean,
      status: "needs_review",
      latestVersion: 1,
      updatedAt: now,
    });
    await ctx.db.insert("versions", {
      videoId,
      number: 1,
      mediaId,
      uploadedBy: user._id,
    });
    return { videoId, mediaId };
  },
});

export const addVersion = mutation({
  args: { videoId: v.id("videos"), note: v.optional(v.string()) },
  returns: v.object({ versionId: v.id("versions"), mediaId: v.id("media") }),
  handler: async (ctx, { videoId, note }) => {
    const video = await ctx.db.get("videos", videoId);
    if (video === null) throw new Error("Video not found");
    const { user, role } = await requireMember(ctx, video.campaignId);
    if (!canUploadVersion(role, video.creatorId === user._id)) {
      throw new Error("Only the creator or an admin can upload a new version");
    }
    const mediaId = await newMedia(ctx, video.campaignId, user._id);
    const number = video.latestVersion + 1;
    const cleanNote = note ? cleanText(note, MAX_BODY) : "";
    const versionId = await ctx.db.insert("versions", {
      videoId,
      number,
      mediaId,
      uploadedBy: user._id,
      note: cleanNote || undefined,
    });
    await ctx.db.patch("videos", videoId, {
      latestVersion: number,
      status: "needs_review",
      updatedAt: Date.now(),
    });
    return { versionId, mediaId };
  },
});

export const rename = mutation({
  args: { videoId: v.id("videos"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, { videoId, title }) => {
    const video = await ctx.db.get("videos", videoId);
    if (video === null) throw new Error("Video not found");
    const { user, role } = await requireMember(ctx, video.campaignId);
    if (!canUploadVersion(role, video.creatorId === user._id)) {
      throw new Error("Only the creator or an admin can rename this video");
    }
    const clean = cleanText(title, MAX_TITLE);
    if (clean.length === 0) throw new Error("Give the video a title");
    await ctx.db.patch("videos", videoId, { title: clean });
    return null;
  },
});

export const setStatus = mutation({
  args: { videoId: v.id("videos"), status: reviewStatusValidator },
  returns: v.null(),
  handler: async (ctx, { videoId, status }) => {
    const video = await ctx.db.get("videos", videoId);
    if (video === null) throw new Error("Video not found");
    const { role } = await requireMember(ctx, video.campaignId);
    if (!canSetStatus(role))
      throw new Error("Only admins can change the status");
    await ctx.db.patch("videos", videoId, { status, updatedAt: Date.now() });
    return null;
  },
});
