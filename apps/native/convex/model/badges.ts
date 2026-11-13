import { passportCounts } from "./passport";
import type { PlaceKind } from "./placeKinds";

type CategoryMeasure = Extract<
  PlaceKind,
  "coffee" | "food" | "dessert" | "drinks" | "activities"
>;

export type BadgeMeasure =
  | "places"
  | "cities"
  | "countries"
  | "completeCities"
  | CategoryMeasure;

export const BADGES = [
  { id: "firstStamp", measure: "places", goal: 1 },
  { id: "explorer", measure: "places", goal: 10 },
  { id: "wanderer", measure: "places", goal: 50 },
  { id: "globetrotter", measure: "places", goal: 150 },
  { id: "cityHopper", measure: "cities", goal: 5 },
  { id: "passportHolder", measure: "countries", goal: 3 },
  { id: "completionist", measure: "completeCities", goal: 1 },
  { id: "coffeeCrawler", measure: "coffee", goal: 5 },
  { id: "foodie", measure: "food", goal: 15 },
  { id: "sweetTooth", measure: "dessert", goal: 5 },
  { id: "nightOwl", measure: "drinks", goal: 5 },
  { id: "outAndAbout", measure: "activities", goal: 5 },
] as const satisfies readonly {
  id: string;
  measure: BadgeMeasure;
  goal: number;
}[];

export type Badge = (typeof BADGES)[number];

export type BadgeId = Badge["id"];

export type BadgeStamp = {
  city?: string;
  countryCode?: string;
  kinds: readonly string[];
};

export type BadgeCity = { stamped: number; total: number };

export type BadgeTotals = Record<BadgeMeasure, number>;

export type BadgeState = { badge: Badge; have: number; earned: boolean };

export function cityComplete({ stamped, total }: BadgeCity): boolean {
  return total > 0 && stamped >= total;
}

export function badgeTotals(
  stamps: readonly BadgeStamp[],
  cities: readonly BadgeCity[],
): BadgeTotals {
  const counts = passportCounts(stamps);
  const ofKind = (kind: CategoryMeasure) =>
    stamps.filter((stamp) => stamp.kinds.includes(kind)).length;
  return {
    places: counts.places,
    cities: counts.cities,
    countries: counts.countries ?? 0,
    completeCities: cities.filter(cityComplete).length,
    coffee: ofKind("coffee"),
    food: ofKind("food"),
    dessert: ofKind("dessert"),
    drinks: ofKind("drinks"),
    activities: ofKind("activities"),
  };
}

export function badgeStates(totals: BadgeTotals): BadgeState[] {
  return BADGES.map((badge) => {
    const reached = totals[badge.measure];
    return {
      badge,
      have: Math.min(reached, badge.goal),
      earned: reached >= badge.goal,
    };
  });
}

export function earnedBadges(totals: BadgeTotals): BadgeId[] {
  return badgeStates(totals)
    .filter((state) => state.earned)
    .map((state) => state.badge.id);
}

export function nextBadge(totals: BadgeTotals): BadgeState | null {
  const open = new Map<BadgeMeasure, BadgeState>();
  for (const state of badgeStates(totals)) {
    if (!state.earned && !open.has(state.badge.measure)) {
      open.set(state.badge.measure, state);
    }
  }
  let next: BadgeState | null = null;
  for (const state of open.values()) {
    if (
      next === null ||
      state.have / state.badge.goal > next.have / next.badge.goal
    ) {
      next = state;
    }
  }
  return next;
}

export function newlyEarned(
  before: readonly BadgeId[],
  after: readonly BadgeId[],
): BadgeId[] {
  return after.filter((id) => !before.includes(id));
}
