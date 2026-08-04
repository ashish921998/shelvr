import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/** Internal read of a space (for AI reclassification). */
export const getSpace = internalQuery({
  args: { spaceId: v.id("spaces") },
  returns: v.union(
    v.object({
      _id: v.id("spaces"),
      userId: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) return null;
    return {
      _id: space._id,
      userId: space.userId,
      name: space.name,
      description: space.description,
    };
  },
});
