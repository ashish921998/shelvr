import { v } from "convex/values";

const SAVE_SOURCES = [
  "onboarding_demo",
  "share_extension",
  "paste",
  "manual_link",
  "note",
  "camera",
  "photo_import",
  "siri",
] as const;

export type SaveSource = (typeof SAVE_SOURCES)[number];

export const saveSourceValidator = v.union(
  ...SAVE_SOURCES.map((source) => v.literal(source)),
);
