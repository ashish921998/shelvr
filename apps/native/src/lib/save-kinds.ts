// The answers to "What do you save?". Each seeds starter spaces: the first
// preset of every picked kind starts selected, the rest are offered as chips.
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
const DEFAULT_GENERIC = "Read later";

/** Deduped preset identities for the picked kinds, in first-seen order. */
export function getSpacePresets(kinds: readonly SaveKind[]): string[] {
  return [
    ...new Set([
      ...kinds.flatMap((kind) => SPACE_PRESETS[kind]),
      ...GENERIC_PRESETS,
    ]),
  ];
}

/** The spaces that start selected for the picked kinds. */
export function getDefaultSpaces(kinds: readonly SaveKind[]): string[] {
  return [
    ...new Set([
      ...kinds.map((kind) => SPACE_PRESETS[kind][0]),
      DEFAULT_GENERIC,
    ]),
  ];
}
