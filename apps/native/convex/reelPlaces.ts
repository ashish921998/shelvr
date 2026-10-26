"use node";

import { generateObject } from "ai";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { MODEL, modelCallOptions } from "./model/aiProvider";
import { logEvent } from "./model/log";
import { readPage } from "./model/pageRead";
import {
  REEL_PLACES_SYSTEM,
  postText,
  reelPlacesPrompt,
  reelPlacesSchema,
  settleReelPlaces,
} from "./model/reelPlaces";

const MODEL_TIMEOUT_MS = 15_000;

const placesValidator = v.object({
  status: v.union(v.literal("ok"), v.literal("unreadable")),
  places: v.array(v.object({ name: v.string(), city: v.optional(v.string()) })),
  city: v.optional(v.string()),
});

/**
 * The web reel place finder: reads one public Instagram or TikTok link and lists
 * the places its caption (and the page it links to) names. Nothing is stored.
 * Reached only through the `/reel-places` HTTP route.
 */
export const find = internalAction({
  args: { url: v.string() },
  returns: placesValidator,
  handler: async (_ctx, { url }) => {
    const startedAt = Date.now();
    const read = await readPage(url);
    if (read.status !== "ok") {
      logEvent("info", "reel_places_found", {
        outcome: "unreadable",
        duration_ms: Date.now() - startedAt,
      });
      return { status: "unreadable" as const, places: [] };
    }
    const text = postText(read.page);
    if (text === "") {
      logEvent("info", "reel_places_found", {
        outcome: "no_text",
        duration_ms: Date.now() - startedAt,
      });
      return { status: "ok" as const, places: [] };
    }
    const { object } = await generateObject({
      model: MODEL,
      ...modelCallOptions(MODEL_TIMEOUT_MS),
      maxRetries: 0,
      system: REEL_PLACES_SYSTEM,
      schema: reelPlacesSchema,
      prompt: reelPlacesPrompt(text),
    });
    const settled = settleReelPlaces(object, text);
    logEvent("info", "reel_places_found", {
      outcome: settled.places.length > 0 ? "places" : "none",
      count: settled.places.length,
      duration_ms: Date.now() - startedAt,
    });
    return { status: "ok" as const, ...settled };
  },
});
