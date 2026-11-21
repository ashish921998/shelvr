import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("admin"), v.literal("creator"));

export const reviewStatusValidator = v.union(
  v.literal("needs_review"),
  v.literal("changes_requested"),
  v.literal("approved"),
);

export const mediaStatusValidator = v.union(
  v.literal("waiting"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("errored"),
);

export default defineSchema({
  ...authTables,
  campaigns: defineTable({
    name: v.string(),
    brief: v.optional(v.string()),
    createdBy: v.id("users"),
  }),
  members: defineTable({
    campaignId: v.id("campaigns"),
    userId: v.id("users"),
    role: roleValidator,
  })
    .index("by_campaignId_and_userId", ["campaignId", "userId"])
    .index("by_userId", ["userId"]),
  invites: defineTable({
    campaignId: v.id("campaigns"),
    email: v.string(),
    role: roleValidator,
    invitedBy: v.id("users"),
  })
    .index("by_email", ["email"])
    .index("by_campaignId_and_email", ["campaignId", "email"]),
  videos: defineTable({
    campaignId: v.id("campaigns"),
    creatorId: v.id("users"),
    title: v.string(),
    status: reviewStatusValidator,
    latestVersion: v.number(),
    updatedAt: v.number(),
  }).index("by_campaignId_and_updatedAt", ["campaignId", "updatedAt"]),
  versions: defineTable({
    videoId: v.id("videos"),
    number: v.number(),
    mediaId: v.id("media"),
    uploadedBy: v.id("users"),
    note: v.optional(v.string()),
  }).index("by_videoId_and_number", ["videoId", "number"]),
  media: defineTable({
    campaignId: v.id("campaigns"),
    uploaderId: v.id("users"),
    status: mediaStatusValidator,
    muxUploadId: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    playbackId: v.optional(v.string()),
    duration: v.optional(v.number()),
    aspectRatio: v.optional(v.string()),
  }),
  comments: defineTable({
    videoId: v.id("videos"),
    versionId: v.id("versions"),
    authorId: v.id("users"),
    parentId: v.optional(v.id("comments")),
    timestamp: v.optional(v.number()),
    body: v.string(),
    mediaId: v.optional(v.id("media")),
    resolved: v.boolean(),
  }).index("by_versionId", ["versionId"]),
});
