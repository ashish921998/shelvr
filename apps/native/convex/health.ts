import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * Trivial database read behind GET /health in http.ts. Uptime monitors hit
 * the endpoint; this query is what proves the deployment can actually reach
 * its database rather than just its edge. Reads at most one doc and never
 * returns user data.
 */
export const ping = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.query("items").first();
    return null;
  },
});
