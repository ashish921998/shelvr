"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/**
 * Retired: saves no longer get embeddings, because nothing the app shows reads them.
 * Kept so a sweep queued before its cron was removed ends quietly.
 */
export const sweepItemEmbeddings = internalAction({
  args: {},
  returns: v.object({ scanned: v.number(), written: v.number() }),
  handler: async () => ({ scanned: 0, written: 0 }),
});
