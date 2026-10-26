import type { PlanKind } from "@/lib/sample-plans";

/** What onboarding asks a person to plan; ids stay stable for analytics and the paywall's `goal` variable. */
export const GOALS = ["date", "travel", "food"] as const;
export type Goal = (typeof GOALS)[number];

export function isGoal(value: unknown): value is Goal {
  return GOALS.some((goal) => goal === value);
}

/** The space each goal starts the shelf with. */
const GOAL_SPACES: Record<Goal, readonly string[]> = {
  date: ["Date nights"],
  travel: ["Travel"],
  food: ["Restaurants to try"],
};

/** Picked goals in a stable order, without repeats or unknown ids. */
export function readGoals(value: unknown): Goal[] {
  if (!Array.isArray(value)) return [];
  return GOALS.filter((goal) => value.includes(goal));
}

export function goalSpaces(goals: readonly Goal[]): string[] {
  return readGoals(goals).flatMap((goal) => GOAL_SPACES[goal]);
}

/** The goal that leads: date night first, then trips, then places to eat. */
export function primaryGoal(goals: readonly Goal[]): Goal | null {
  return readGoals(goals)[0] ?? null;
}

const GOAL_PLAN: Record<Goal, PlanKind> = {
  date: "date",
  travel: "trip",
  food: "weekend",
};

/** The sample plan onboarding shows: a date night, else a trip, else a weekend of food. */
export function planKindFor(goals: readonly Goal[]): PlanKind {
  const goal = primaryGoal(goals);
  return goal === null ? "weekend" : GOAL_PLAN[goal];
}

export const SAVED_COUNTS = [
  "few",
  "tenToFifty",
  "fiftyToTwoHundred",
  "hundreds",
  "lostCount",
] as const;
export type SavedCount = (typeof SAVED_COUNTS)[number];

export const isSavedCount = (value: unknown): value is SavedCount =>
  SAVED_COUNTS.some((count) => count === value);

export const PLANNERS = [
  "planner",
  "flexible",
  "spontaneous",
  "explorer",
] as const;
export type Planner = (typeof PLANNERS)[number];

export const isPlanner = (value: unknown): value is Planner =>
  PLANNERS.some((planner) => planner === value);
