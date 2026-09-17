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
function getDefaultSpaces(kinds: readonly SaveKind[]): string[] {
  return [
    ...new Set([
      ...kinds.map((kind) => SPACE_PRESETS[kind][0]),
      DEFAULT_GENERIC,
    ]),
  ];
}

const PRESET_SPACES: ReadonlySet<string> = new Set([
  ...Object.values(SPACE_PRESETS).flat(),
  ...GENERIC_PRESETS,
]);

/** Whether a picked space is a preset identity rather than a typed name. */
export function isPresetSpace(name: string): boolean {
  return PRESET_SPACES.has(name);
}

/** The picked spaces after `kind` is picked or unpicked. Unpicking drops only
 * the preset that picking the kind added, unless a remaining kind still offers
 * it. Spaces the user picked stay, and the setup step keeps showing them. */
export function spacesAfterKindToggle(
  kinds: readonly SaveKind[],
  spaces: readonly string[],
  kind: SaveKind,
): string[] {
  const seeded = SPACE_PRESETS[kind][0];
  if (!kinds.includes(kind)) {
    if (spaces.length === 0) return getDefaultSpaces([...kinds, kind]);
    return spaces.includes(seeded) ? [...spaces] : [...spaces, seeded];
  }
  const remaining = kinds.filter((value) => value !== kind);
  if (getSpacePresets(remaining).includes(seeded)) return [...spaces];
  return spaces.filter((name) => name !== seeded);
}
