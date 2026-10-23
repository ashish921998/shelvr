import type { DemoSample } from "@/lib/onboarding-demo";
import {
  DEMO_SAMPLES,
  findSample,
  practiceShareSample,
} from "@/lib/onboarding-demo";
import type { OnboardingStep } from "@/lib/onboarding-steps";
import type { SampleCityId } from "@/lib/sample-cities";
import {
  isPlanPost,
  planCity,
  planPost,
  type PlanKind,
} from "@/lib/sample-plans";

export const GOALS = ["travel", "food", "date", "recipes", "other"] as const;
export type Goal = (typeof GOALS)[number];

export function isGoal(value: unknown): value is Goal {
  return GOALS.some((goal) => goal === value);
}

/** The plan a places goal ends on; recipes and "other" have none. */
export const GOAL_PLANS: Record<Goal, PlanKind | null> = {
  travel: "trip",
  food: "weekend",
  date: "date",
  recipes: null,
  other: null,
};

export type PlacesGoal = Exclude<Goal, "recipes" | "other">;

/** Whether `goal` asks for a city and ends on a sample plan. */
export const isPlacesGoal = (goal: Goal | null): goal is PlacesGoal =>
  goal !== null && GOAL_PLANS[goal] !== null;

/** The space a goal starts the shelf with; "other" leaves it to the topic picker. */
export const GOAL_SPACES: Record<Goal, readonly string[]> = {
  travel: ["Travel"],
  food: ["Restaurants to try"],
  date: ["Date nights"],
  recipes: ["Recipes"],
  other: [],
};

const PLACES_FLOW: readonly OnboardingStep[] = [
  "opener",
  "goal",
  "city",
  "share",
  "tripBuild",
  "tripReveal",
  "promise",
  "notifications",
];
const TOPICS_FLOW: readonly OnboardingStep[] = [
  "opener",
  "goal",
  "interests",
  "share",
  "promise",
  "notifications",
];

const RECIPES_FLOW: readonly OnboardingStep[] = [
  "opener",
  "goal",
  "share",
  "recipeReveal",
  "promise",
  "notifications",
];

export function goalFlow(goal: Goal | null): readonly OnboardingStep[] {
  if (goal === null || goal === "other") return TOPICS_FLOW;
  return goal === "recipes" ? RECIPES_FLOW : PLACES_FLOW;
}

/** Whether `url` is one of the posts onboarding offers to practise sharing. */
export function isPracticePost(url: string): boolean {
  return findSample(url) !== undefined || isPlanPost(url);
}

/** The post a goal practises sharing: the recipe sample, or a stop in the plan it shows next. */
export function goalShareSample(
  goal: Goal,
  city: SampleCityId | null,
): DemoSample | undefined {
  if (goal === "recipes") {
    return DEMO_SAMPLES.find((sample) => sample.kind === "Recipes");
  }
  const kind = GOAL_PLANS[goal];
  if (kind === null) return undefined;
  if (kind === "trip") return practiceShareSample(["Travel"], city);
  const id = planCity(kind, city);
  const post = planPost(kind, id);
  return {
    kind: "Travel",
    city: id,
    picture: post.picture,
    url: post.url,
    pageHeading: post.name,
    domain: new URL(post.url).hostname,
  };
}
