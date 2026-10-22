import type { AnalyticsEventProperties } from "@/lib/analytics";
import type { Goal } from "@/lib/onboarding-goals";
import { isInterest } from "@/lib/onboarding-interests";
import type { SampleCityId } from "@/lib/sample-cities";
import { isPresetSpace } from "@/lib/save-kinds";
import { isTravelVibe } from "@/lib/travel-vibes";

/** Topics and travel vibes count as spaces; only preset identities are named, typed names are user content, and the sample city is one of a fixed list. */
export function onboardingCompletedProperties(
  spaces: readonly string[],
  travelCity: SampleCityId | null = null,
  goal: Goal | null = null,
): AnalyticsEventProperties["onboarding_completed"] {
  return {
    save_pileup: [],
    interests: spaces.filter(isInterest),
    travel_vibes: spaces.filter(isTravelVibe),
    sample_city: travelCity,
    goal,
    space_count: spaces.length,
    space_names: spaces.filter(isPresetSpace),
    custom_space_count: spaces.filter((name) => !isPresetSpace(name)).length,
    $set: { save_pileup: [] },
  };
}
