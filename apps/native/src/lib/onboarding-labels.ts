import { t } from "./i18n";
import type { TextMessageKey } from "@/locales/message-types";

// Stable survey/preset identities remain compatible with persisted onboarding.
const LABELS: Record<string, TextMessageKey> = {
  "X bookmarks": "survey.xBookmarks",
  "Instagram saved": "survey.instagram",
  Screenshots: "survey.screenshots",
  "Notes app": "survey.notesApp",
  "Browser tabs": "survey.browserTabs",
  Everywhere: "survey.everywhere",
  Articles: "presets.articles",
  Recipes: "presets.recipes",
  Products: "presets.products",
  "Home & decor": "presets.homeDecor",
  Travel: "presets.travel",
  Fitness: "presets.fitness",
  Inspiration: "presets.inspiration",
  Videos: "presets.videos",
  "Read later": "presets.readLater",
  "Long reads": "presets.longReads",
  "Restaurants to try": "presets.restaurants",
  Wishlist: "presets.wishlist",
  "Gift ideas": "presets.gifts",
  "Decor ideas": "presets.decor",
  "Trip ideas": "presets.trips",
  Workouts: "presets.workouts",
  Ideas: "presets.ideas",
  "Watch later": "presets.watchLater",
};

export function onboardingLabel(id: string): string {
  return Object.hasOwn(LABELS, id) ? t(LABELS[id]) : id;
}
