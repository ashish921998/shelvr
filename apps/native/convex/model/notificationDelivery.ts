import { v } from "convex/values";

export const recipientValidator = v.object({
  token: v.string(),
  state: v.union(
    v.literal("pending"),
    v.literal("receipt"),
    v.literal("delivered"),
    v.literal("failed"),
  ),
  ticketId: v.optional(v.string()),
  error: v.optional(v.string()),
});
