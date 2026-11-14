import { t } from "@/lib/i18n";
import type {
  Badge,
  BadgeId,
  BadgeMeasure,
  BadgeState,
} from "@convex/model/badges";

const NAMES = {
  firstStamp: "badges.firstStamp",
  explorer: "badges.explorer",
  wanderer: "badges.wanderer",
  globetrotter: "badges.globetrotter",
  cityHopper: "badges.cityHopper",
  passportHolder: "badges.passportHolder",
  completionist: "badges.completionist",
  coffeeCrawler: "badges.coffeeCrawler",
  foodie: "badges.foodie",
  sweetTooth: "badges.sweetTooth",
  nightOwl: "badges.nightOwl",
  outAndAbout: "badges.outAndAbout",
} as const satisfies Record<BadgeId, string>;

const EMOJI: Record<BadgeId, string> = {
  firstStamp: "📍",
  explorer: "🧭",
  wanderer: "🥾",
  globetrotter: "🌍",
  cityHopper: "🏙️",
  passportHolder: "🛂",
  completionist: "🏆",
  coffeeCrawler: "☕",
  foodie: "🍜",
  sweetTooth: "🍰",
  nightOwl: "🦉",
  outAndAbout: "🎡",
};

const GOALS = {
  places: "badges.goalPlaces",
  cities: "badges.goalCities",
  countries: "badges.goalCountries",
  completeCities: "badges.goalCompleteCities",
  coffee: "badges.goalCoffee",
  food: "badges.goalFood",
  dessert: "badges.goalDessert",
  drinks: "badges.goalDrinks",
  activities: "badges.goalActivities",
} as const satisfies Record<BadgeMeasure, string>;

const PROGRESS = {
  places: "badges.progressPlaces",
  cities: "badges.progressCities",
  countries: "badges.progressCountries",
  completeCities: "badges.progressCompleteCities",
  coffee: "badges.progressCoffee",
  food: "badges.progressFood",
  dessert: "badges.progressDessert",
  drinks: "badges.progressDrinks",
  activities: "badges.progressActivities",
} as const satisfies Record<BadgeMeasure, string>;

export function badgeName(id: BadgeId): string {
  return t(NAMES[id]);
}

export function badgeEmoji(id: BadgeId): string {
  return EMOJI[id];
}

export function badgeGoal(badge: Badge): string {
  return t(GOALS[badge.measure], { count: badge.goal });
}

export function badgeProgress({ badge, have }: BadgeState): string {
  return t(PROGRESS[badge.measure], { count: badge.goal, visited: have });
}
