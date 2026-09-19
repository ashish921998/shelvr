import { v } from "convex/values";

/**
 * Where a save came from, defined once for both sides: `items.ts` and `demo.ts`
 * validate it on the way in, and the native app loads this module as
 * `@convex/model/saveSource` to type its call sites against the same tuple
 * instead of restating the ids. Nothing but `convex/values` is imported here,
 * so the client never pulls the server runtime in behind it.
 *
 * Each id is an analytics contract — the `save_source` property on the
 * `item_saved` event, which PostHog dashboards group on. Adding one is additive;
 * renaming one splits an existing funnel in two without saying so.
 */
export const SAVE_SOURCES = [
  "onboarding_demo",
  "share_extension",
  "paste",
  "manual_link",
  "note",
  "camera",
  "photo_import",
] as const;

export type SaveSource = (typeof SAVE_SOURCES)[number];

export const saveSourceValidator = v.union(
  ...SAVE_SOURCES.map((source) => v.literal(source)),
);
