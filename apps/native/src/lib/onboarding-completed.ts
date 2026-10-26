import type { AnalyticsEventProperties } from "@/lib/analytics";
import {
  primaryGoal,
  type Goal,
  type Planner,
  type SavedCount,
} from "@/lib/onboarding-goals";
import { isInterest } from "@/lib/onboarding-interests";
import type { SampleCityId } from "@/lib/sample-cities";
import { isPresetSpace } from "@/lib/save-kinds";
import { isTravelVibe } from "@/lib/travel-vibes";

type Answers = {
  travelCity?: SampleCityId | null;
  goals?: readonly Goal[];
  savedCount?: SavedCount | null;
  planner?: Planner | null;
};

/** Topics and travel vibes count as spaces; only preset identities are named, typed names are user content, and the sample city is one of a fixed list. */
export function onboardingCompletedProperties(
  spaces: readonly string[],
  answers: Answers = {},
): AnalyticsEventProperties["onboarding_completed"] {
  const goals = [...(answers.goals ?? [])];
  return {
    save_pileup: [],
    interests: spaces.filter(isInterest),
    travel_vibes: spaces.filter(isTravelVibe),
    sample_city: answers.travelCity ?? null,
    goal: primaryGoal(goals),
    goals,
    saved_count: answers.savedCount ?? null,
    planner: answers.planner ?? null,
    space_count: spaces.length,
    space_names: spaces.filter(isPresetSpace),
    custom_space_count: spaces.filter((name) => !isPresetSpace(name)).length,
    $set: { save_pileup: [] },
  };
}
