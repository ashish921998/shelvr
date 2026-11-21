import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { displayName, requireMember, viewerRole } from "./model/access";
import {
  canModerateComment,
  cleanText,
  cleanTimestamp,
  MAX_BODY,
} from "./model/rules";
import { mediaStatusValidator } from "./schema";

export const list = query({
  args: { versionId: v.id("versions") },
  returns: v.array(
    v.object({
      _id: v.id("comments"),
      _creationTime: v.number(),
      authorName: v.string(),
      authorRole: v.union(v.literal("admin"), v.literal("creator"), v.null()),
      isMine: v.boolean(),
      canModerate: v.boolean(),
      canResolve: v.boolean(),
      parentId: v.union(v.id("comments"), v.null()),
      timestamp: v.union(v.number(), v.null()),
      body: v.string(),
      resolved: v.boolean(),
      recording: v.union(
        v.null(),
        v.object({
          _id: v.id("media"),
          status: mediaStatusValidator,
          duration: v.union(v.number(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get("versions", versionId);
    if (version === null) return [];
    const video = await ctx.db.get("videos", version.videoId);
    if (video === null) return [];
    const viewer = await viewerRole(ctx, video.campaignId);
    if (viewer === null) return [];
    const rows = await ctx.db
      .query("comments")
      .withIndex("by_versionId", (q) => q.eq("versionId", versionId))
      .take(1000);
    const roles = new Map<string, "admin" | "creator" | null>();
    const result = [];
    for (const row of rows) {
      const author = await ctx.db.get("users", row.authorId);
      if (!roles.has(row.authorId)) {
        const member = await ctx.db
          .query("members")
          .withIndex("by_campaignId_and_userId", (q) =>
            q.eq("campaignId", video.campaignId).eq("userId", row.authorId),
          )
          .unique();
        roles.set(row.authorId, member?.role ?? null);
      }
      const media = row.mediaId ? await ctx.db.get("media", row.mediaId) : null;
      const isMine = row.authorId === viewer.user._id;
      result.push({
        _id: row._id,
        _creationTime: row._creationTime,
        authorName: displayName(author),
        authorRole: roles.get(row.authorId) ?? null,
        isMine,
        canModerate: canModerateComment(viewer.role, isMine),
        canResolve:
          viewer.role === "admin" ||
          isMine ||
          video.creatorId === viewer.user._id,
        parentId: row.parentId ?? null,
        timestamp: row.timestamp ?? null,
        body: row.body,
        resolved: row.resolved,
        recording: media
          ? {
              _id: media._id,
              status: media.status,
              duration: media.duration ?? null,
            }
          : null,
      });
    }
    return result;
  },
});

export const add = mutation({
  args: {
    versionId: v.id("versions"),
    body: v.string(),
    timestamp: v.optional(v.number()),
    parentId: v.optional(v.id("comments")),
    withRecording: v.optional(v.boolean()),
  },
  returns: v.object({
    commentId: v.id("comments"),
    mediaId: v.union(v.id("media"), v.null()),
  }),
  handler: async (ctx, args) => {
    const version = await ctx.db.get("versions", args.versionId);
    if (version === null) throw new Error("Version not found");
    const video = await ctx.db.get("videos", version.videoId);
    if (video === null) throw new Error("Video not found");
    const { user } = await requireMember(ctx, video.campaignId);
    const body = cleanText(args.body, MAX_BODY);
    if (body.length === 0 && !args.withRecording) {
      throw new Error("Write something first");
    }
    let parentId = undefined;
    if (args.parentId) {
      const parent = await ctx.db.get("comments", args.parentId);
      if (parent === null || parent.versionId !== args.versionId) {
        throw new Error("That comment is gone");
      }
      parentId = parent.parentId ?? parent._id;
    }
    const mediaId = args.withRecording
      ? await ctx.db.insert("media", {
          campaignId: video.campaignId,
          uploaderId: user._id,
          status: "waiting",
        })
      : null;
    const commentId = await ctx.db.insert("comments", {
      videoId: video._id,
      versionId: args.versionId,
      authorId: user._id,
      parentId,
      timestamp: parentId ? undefined : cleanTimestamp(args.timestamp),
      body,
      mediaId: mediaId ?? undefined,
      resolved: false,
    });
    return { commentId, mediaId };
  },
});

export const setResolved = mutation({
  args: { commentId: v.id("comments"), resolved: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { commentId, resolved }) => {
    const comment = await ctx.db.get("comments", commentId);
    if (comment === null) return null;
    const video = await ctx.db.get("videos", comment.videoId);
    if (video === null) return null;
    const { user, role } = await requireMember(ctx, video.campaignId);
    const isVideoCreator = video.creatorId === user._id;
    if (role !== "admin" && !isVideoCreator && comment.authorId !== user._id) {
      throw new Error(
        "Only admins, the creator or the author can resolve this",
      );
    }
    await ctx.db.patch("comments", commentId, { resolved });
    return null;
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, { commentId }) => {
    const comment = await ctx.db.get("comments", commentId);
    if (comment === null) return null;
    const video = await ctx.db.get("videos", comment.videoId);
    if (video === null) return null;
    const { user, role } = await requireMember(ctx, video.campaignId);
    if (!canModerateComment(role, comment.authorId === user._id)) {
      throw new Error("Only the author or an admin can delete this");
    }
    const replies = await ctx.db
      .query("comments")
      .withIndex("by_versionId", (q) => q.eq("versionId", comment.versionId))
      .take(1000);
    for (const reply of replies) {
      if (reply.parentId === commentId) {
        await ctx.db.delete("comments", reply._id);
      }
    }
    await ctx.db.delete("comments", commentId);
    return null;
  },
});
