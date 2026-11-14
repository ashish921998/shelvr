import { v } from "convex/values";
import { rawReadySavesNewestFirst } from "./items";
import { authedMutation } from "./model/auth";
import { cityKey } from "./model/trip";

export const setCityCover = authedMutation({
  args: { itemId: v.id("items"), city: v.string(), on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = cityKey(args.city);
    const item = await ctx.db.get(args.itemId);
    if (item === null || item.userId !== ctx.userId) {
      throw new Error("Save not found");
    }
    if (key === "" || !(item.cities ?? []).some((c) => cityKey(c) === key)) {
      throw new Error("Save is not in that city");
    }
    if (
      args.on &&
      item.storageId === undefined &&
      item.heroImageUrl === undefined
    ) {
      throw new Error("Save has no photo");
    }
    const own = item.coverFor?.find((pick) => pick.key === key)?.at;
    const others = (await rawReadySavesNewestFirst(ctx, ctx.userId)).filter(
      (other) =>
        other._id !== item._id &&
        other.coverFor?.some((pick) => pick.key === key),
    );
    const newer = others.some((other) =>
      other.coverFor?.some(
        (pick) => pick.key === key && (own === undefined || pick.at > own),
      ),
    );
    if (args.on || !newer) {
      for (const other of others) {
        const kept = (other.coverFor ?? []).filter((pick) => pick.key !== key);
        await ctx.db.patch(other._id, {
          coverFor: kept.length > 0 ? kept : undefined,
        });
      }
    }
    const rest = (item.coverFor ?? []).filter((pick) => pick.key !== key);
    const next = args.on ? [...rest, { key, at: Date.now() }] : rest;
    await ctx.db.patch(item._id, {
      coverFor: next.length > 0 ? next : undefined,
    });
    return null;
  },
});
