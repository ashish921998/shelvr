import type { DemoSample } from "@/lib/onboarding-demo";
import { findSample, practiceShareSample } from "@/lib/onboarding-demo";
import type { OnboardingStep } from "@/lib/onboarding-steps";
import type { SampleCityId } from "@/lib/sample-cities";
import {
  isPlanPost,
  planCity,
  planPost,
  type PlanKind,
} from "@/lib/sample-plans";

export const GOALS = ["travel", "food", "date", "other"] as const;
export type Goal = (typeof GOALS)[number];

export function isGoal(value: unknown): value is Goal {
  return GOALS.some((goal) => goal === value);
}

/** The plan a places goal ends on; "other" has none and keeps the topic picker. */
export const GOAL_PLANS: Record<Goal, PlanKind | null> = {
  travel: "trip",
  food: "weekend",
  date: "date",
  other: null,
};

/** The space a places goal starts the shelf with. */
export const GOAL_SPACES: Record<Goal, readonly string[]> = {
  travel: ["Travel"],
  food: ["Restaurants to try"],
  date: ["Date nights"],
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
];
const TOPICS_FLOW: readonly OnboardingStep[] = [
  "opener",
  "goal",
  "interests",
  "share",
  "promise",
];

export function goalFlow(goal: Goal | null): readonly OnboardingStep[] {
  return goal === null || goal === "other" ? TOPICS_FLOW : PLACES_FLOW;
}

/** Whether `url` is one of the posts onboarding offers to practise sharing. */
export function isPracticePost(url: string): boolean {
  return findSample(url) !== undefined || isPlanPost(url);
}

/** The post a places goal practises sharing: a stop in the plan it shows next. */
export function goalShareSample(
  goal: Goal,
  city: SampleCityId | null,
): DemoSample | undefined {
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
