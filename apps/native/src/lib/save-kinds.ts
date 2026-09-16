// The answers to "What do you save?". Each seeds starter spaces, so a user who
// picks Recipes lands with Recipes and Restaurants to try already selected.
export const SAVE_KINDS = [
  "Articles",
  "Recipes",
  "Products",
  "Home & decor",
  "Travel",
  "Inspiration",
  "Fitness",
  "Videos",
] as const;
export type SaveKind = (typeof SAVE_KINDS)[number];

export function isSaveKind(value: string): value is SaveKind {
  return SAVE_KINDS.some((kind) => kind === value);
}

export const SPACE_PRESETS: Record<SaveKind, readonly string[]> = {
  Articles: ["Articles", "Read later", "Long reads"],
  Recipes: ["Recipes", "Restaurants to try"],
  Products: ["Wishlist", "Gift ideas"],
  "Home & decor": ["Home & decor", "Decor ideas"],
  Travel: ["Travel", "Trip ideas"],
  Fitness: ["Fitness", "Workouts"],
  Inspiration: ["Inspiration", "Ideas"],
  Videos: ["Videos", "Watch later"],
};

const GENERIC_PRESETS = ["Read later", "Inspiration", "Wishlist"];

/** Deduped preset identities for the picked kinds, in first-seen order. */
export function getSpacePresets(kinds: readonly SaveKind[]): string[] {
  return [
    ...new Set([
      ...kinds.flatMap((kind) => SPACE_PRESETS[kind]),
      ...GENERIC_PRESETS,
    ]),
  ];
}
