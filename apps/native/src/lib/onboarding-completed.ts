import type { AnalyticsEventProperties } from "@/lib/analytics";
import { isInterest } from "@/lib/onboarding-interests";
import { isPresetSpace, type SaveKind } from "@/lib/save-kinds";
import { isTravelVibe } from "@/lib/travel-vibes";

/** Topics and travel vibes count as spaces; only preset identities are named, typed names are user content. */
export function onboardingCompletedProperties(
  kinds: readonly SaveKind[],
  spaces: readonly string[],
): AnalyticsEventProperties["onboarding_completed"] {
  const saveTypes = [...kinds];
  return {
    save_pileup: [],
    save_types: saveTypes,
    interests: spaces.filter(isInterest),
    travel_vibes: spaces.filter(isTravelVibe),
    space_count: spaces.length,
    space_names: spaces.filter(isPresetSpace),
    custom_space_count: spaces.filter((name) => !isPresetSpace(name)).length,
    $set: { save_pileup: [], save_types: saveTypes },
  };
}
