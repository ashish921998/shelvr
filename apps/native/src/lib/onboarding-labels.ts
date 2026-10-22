import { t } from "./i18n";
import type { TextMessageKey } from "@/locales/message-types";

const LABELS: Record<string, TextMessageKey> = {
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
  "Food & recipes": "interests.foodRecipes",
  "Home & design": "interests.homeDesign",
  "Style & shopping": "interests.styleShopping",
  "Fitness & wellness": "interests.fitnessWellness",
  "AI & tech": "interests.aiTech",
  "Business & productivity": "interests.businessProductivity",
  "Films, books & music": "interests.filmsBooksMusic",
  "Good food": "interests.vibeGoodFood",
  "Aesthetic cafés": "interests.vibeCafes",
  "Date nights": "interests.vibeDateNights",
  "Hidden gems": "interests.vibeHiddenGems",
  "Going out": "interests.vibeGoingOut",
};

export function onboardingLabel(id: string): string {
  return Object.hasOwn(LABELS, id) ? t(LABELS[id]) : id;
}
