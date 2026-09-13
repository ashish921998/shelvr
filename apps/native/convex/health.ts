import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const ping = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.query("items").first();
    return null;
  },
});
