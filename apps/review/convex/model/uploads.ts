import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function claimUpload(
  ctx: MutationCtx,
  mediaId: Id<"media">,
  campaignId: Id<"campaigns">,
  uploaderId: Id<"users">,
): Promise<void> {
  const media = await ctx.db.get("media", mediaId);
  if (
    media === null ||
    media.campaignId !== campaignId ||
    media.uploaderId !== uploaderId
  ) {
    throw new Error("This upload is not yours");
  }
  if (media.status !== "ready") throw new Error("The upload hasn't finished");
  const version = await ctx.db
    .query("versions")
    .withIndex("by_mediaId", (q) => q.eq("mediaId", mediaId))
    .first();
  const comment = await ctx.db
    .query("comments")
    .withIndex("by_mediaId", (q) => q.eq("mediaId", mediaId))
    .first();
  if (version !== null || comment !== null) {
    throw new Error("This upload is already used");
  }
}
