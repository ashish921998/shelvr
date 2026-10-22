import { INTERESTS } from "@/lib/onboarding-interests";
import { TRAVEL_VIBES } from "@/lib/travel-vibes";

export type SaveKind =
  | "Travel"
  | "Recipes"
  | "Articles"
  | "Products"
  | "Home & decor"
  | "Inspiration"
  | "Fitness"
  | "Videos";

const SPACE_PRESETS: Record<SaveKind, readonly string[]> = {
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

const PRESET_SPACES: ReadonlySet<string> = new Set([
  ...Object.values(SPACE_PRESETS).flat(),
  ...GENERIC_PRESETS,
  ...INTERESTS,
  ...TRAVEL_VIBES,
]);

export function isPresetSpace(name: string): boolean {
  return PRESET_SPACES.has(name);
}
