import type { AnalyticsEventProperties } from "@/lib/analytics";
import { isInterest } from "@/lib/onboarding-interests";
import type { SampleCityId } from "@/lib/sample-cities";
import { isPresetSpace, type SaveKind } from "@/lib/save-kinds";
import { isTravelVibe } from "@/lib/travel-vibes";

/** The onboarding_completed event, from the setup answers. Topics and travel
 * vibes are spaces too, so each is counted in space_count and, being a preset
 * identity, listed in space_names. Only typed names are user content; the
 * sample city is one of a fixed list. */
export function onboardingCompletedProperties(
  kinds: readonly SaveKind[],
  spaces: readonly string[],
  travelCity: SampleCityId | null = null,
): AnalyticsEventProperties["onboarding_completed"] {
  const saveTypes = [...kinds];
  return {
    save_pileup: [],
    save_types: saveTypes,
    interests: spaces.filter(isInterest),
    travel_vibes: spaces.filter(isTravelVibe),
    sample_city: travelCity,
    space_count: spaces.length,
    space_names: spaces.filter(isPresetSpace),
    custom_space_count: spaces.filter((name) => !isPresetSpace(name)).length,
    $set: { save_pileup: [], save_types: saveTypes },
  };
}
