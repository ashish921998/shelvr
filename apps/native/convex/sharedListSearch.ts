"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { searchTripPlacesResultValidator } from "./model/tripPlan";
import {
  searchPlacesNear,
  shortQuery,
  tidyQuery,
  type SearchResult,
} from "./tripPlanner";

export const searchListPlaces = action({
  args: {
    listId: v.id("sharedLists"),
    query: v.string(),
    locale: v.optional(v.string()),
  },
  returns: searchTripPlacesResultValidator,
  handler: async (ctx, args): Promise<SearchResult> => {
    const query = tidyQuery(args.query);
    if (shortQuery(query)) return { available: true, places: [] };
    const claim = await ctx.runMutation(
      internal.sharedLists.claimListSearchInternal,
      { listId: args.listId },
    );
    return await searchPlacesNear(claim, query, args.locale);
  },
});
