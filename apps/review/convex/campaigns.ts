import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, mutation, query } from "./_generated/server";
import {
  currentUser,
  displayName,
  isStaffEmail,
  membership,
  requireAdmin,
  requireUser,
  viewerRole,
} from "./model/access";
import { cleanText, isEmail, MAX_TITLE, normalizeEmail } from "./model/rules";
import { roleValidator } from "./schema";

export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      email: v.union(v.string(), v.null()),
      name: v.string(),
      isStaff: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null) return null;
    return {
      email: user.email ?? null,
      name: displayName(user),
      isStaff: isStaffEmail(user.email),
    };
  },
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("campaigns"),
      name: v.string(),
      role: roleValidator,
    }),
  ),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null) return [];
    const rows = await ctx.db
      .query("members")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(200);
    const campaigns = [];
    for (const row of rows) {
      const campaign = await ctx.db.get("campaigns", row.campaignId);
      if (campaign) {
        campaigns.push({
          _id: campaign._id,
          name: campaign.name,
          role: row.role,
        });
      }
    }
    return campaigns;
  },
});

export const get = query({
  args: { campaignId: v.id("campaigns") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("campaigns"),
      name: v.string(),
      brief: v.union(v.string(), v.null()),
      role: roleValidator,
      members: v.array(
        v.object({
          _id: v.id("members"),
          name: v.string(),
          email: v.union(v.string(), v.null()),
          role: roleValidator,
          isYou: v.boolean(),
        }),
      ),
      invites: v.array(
        v.object({
          _id: v.id("invites"),
          email: v.string(),
          role: roleValidator,
        }),
      ),
    }),
  ),
  handler: async (ctx, { campaignId }) => {
    const viewer = await viewerRole(ctx, campaignId);
    const campaign = await ctx.db.get("campaigns", campaignId);
    if (viewer === null || campaign === null) return null;
    const memberRows = await ctx.db
      .query("members")
      .withIndex("by_campaignId_and_userId", (q) =>
        q.eq("campaignId", campaignId),
      )
      .take(500);
    const members = [];
    for (const row of memberRows) {
      const user = await ctx.db.get("users", row.userId);
      members.push({
        _id: row._id,
        name: displayName(user),
        email: viewer.role === "admin" ? (user?.email ?? null) : null,
        role: row.role,
        isYou: row.userId === viewer.user._id,
      });
    }
    const invites =
      viewer.role === "admin"
        ? (
            await ctx.db
              .query("invites")
              .withIndex("by_campaignId_and_email", (q) =>
                q.eq("campaignId", campaignId),
              )
              .take(500)
          ).map((invite) => ({
            _id: invite._id,
            email: invite.email,
            role: invite.role,
          }))
        : [];
    return {
      _id: campaign._id,
      name: campaign.name,
      brief: campaign.brief ?? null,
      role: viewer.role,
      members,
      invites,
    };
  },
});

export const create = mutation({
  args: { name: v.string(), brief: v.optional(v.string()) },
  returns: v.id("campaigns"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaffEmail(user.email)) {
      throw new Error("Only Shelvr staff can start a campaign");
    }
    const name = cleanText(args.name, MAX_TITLE);
    if (name.length === 0) throw new Error("Give the campaign a name");
    const brief = args.brief ? cleanText(args.brief, 4000) : undefined;
    const campaignId = await ctx.db.insert("campaigns", {
      name,
      brief: brief || undefined,
      createdBy: user._id,
    });
    await ctx.db.insert("members", {
      campaignId,
      userId: user._id,
      role: "admin",
    });
    return campaignId;
  },
});

export const updateBrief = mutation({
  args: { campaignId: v.id("campaigns"), brief: v.string() },
  returns: v.null(),
  handler: async (ctx, { campaignId, brief }) => {
    await requireAdmin(ctx, campaignId);
    const text = cleanText(brief, 4000);
    await ctx.db.patch("campaigns", campaignId, { brief: text || undefined });
    return null;
  },
});

export const invite = mutation({
  args: {
    campaignId: v.id("campaigns"),
    email: v.string(),
    role: roleValidator,
  },
  returns: v.union(v.literal("added"), v.literal("invited")),
  handler: async (ctx, args) => {
    const inviter = await requireAdmin(ctx, args.campaignId);
    const email = normalizeEmail(args.email);
    if (!isEmail(email)) throw new Error("That email doesn't look right");
    const campaign = await ctx.db.get("campaigns", args.campaignId);
    if (campaign === null) throw new Error("Campaign not found");
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (existingUser) {
      const member = await membership(ctx, args.campaignId, existingUser._id);
      if (member) {
        if (member.role === "admin" && args.role !== "admin") {
          const members = await ctx.db
            .query("members")
            .withIndex("by_campaignId_and_userId", (q) =>
              q.eq("campaignId", args.campaignId),
            )
            .take(500);
          if (members.filter((m) => m.role === "admin").length <= 1) {
            throw new Error("A campaign needs at least one admin");
          }
        }
        await ctx.db.patch("members", member._id, { role: args.role });
      } else {
        await ctx.db.insert("members", {
          campaignId: args.campaignId,
          userId: existingUser._id,
          role: args.role,
        });
      }
    } else {
      const pending = await ctx.db
        .query("invites")
        .withIndex("by_campaignId_and_email", (q) =>
          q.eq("campaignId", args.campaignId).eq("email", email),
        )
        .unique();
      if (pending) {
        await ctx.db.patch("invites", pending._id, { role: args.role });
      } else {
        await ctx.db.insert("invites", {
          campaignId: args.campaignId,
          email,
          role: args.role,
          invitedBy: inviter._id,
        });
      }
    }
    await ctx.scheduler.runAfter(0, internal.campaigns.sendInviteEmail, {
      email,
      campaignId: args.campaignId,
      campaignName: campaign.name,
      inviterName: displayName(inviter),
    });
    return existingUser ? "added" : "invited";
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("invites") },
  returns: v.null(),
  handler: async (ctx, { inviteId }) => {
    const invite = await ctx.db.get("invites", inviteId);
    if (invite === null) return null;
    await requireAdmin(ctx, invite.campaignId);
    await ctx.db.delete("invites", inviteId);
    return null;
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("members") },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get("members", memberId);
    if (member === null) return null;
    const admin = await requireAdmin(ctx, member.campaignId);
    if (member.userId === admin._id) {
      throw new Error("You can't remove yourself");
    }
    await ctx.db.delete("members", memberId);
    return null;
  },
});

export const sendInviteEmail = internalAction({
  args: {
    email: v.string(),
    campaignId: v.id("campaigns"),
    campaignName: v.string(),
    inviterName: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const apiKey = env.AUTH_RESEND_KEY;
    if (!apiKey) return null;
    const site = env.SITE_URL ?? "https://review.tryshelvr.app";
    const link = `${site}/campaigns/${args.campaignId}`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.REVIEW_EMAIL_FROM ?? "Shelvr Review <review@tryshelvr.app>",
        to: [args.email],
        subject: `${args.inviterName} invited you to ${args.campaignName}`,
        text: `${args.inviterName} invited you to review videos for "${args.campaignName}" on Shelvr Review.\n\nSign in with this email address to join:\n${link}\n`,
      }),
    });
    if (!response.ok) {
      throw new Error(`Invite email failed with ${response.status}`);
    }
    return null;
  },
});
