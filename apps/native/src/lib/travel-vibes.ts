import type { Interest } from "@/lib/onboarding-interests";

export const TRAVEL_VIBES = [
  "Good food",
  "Aesthetic cafés",
  "Date nights",
  "Hidden gems",
  "Going out",
] as const;
export type TravelVibe = (typeof TRAVEL_VIBES)[number];

export function isTravelVibe(value: string): value is TravelVibe {
  return TRAVEL_VIBES.some((vibe) => vibe === value);
}

export const VIBES_INTEREST: Interest = "Travel";

/** The spaces after `interest` is toggled; unpicking Travel drops its vibes too, since their card hides with it. */
export function spacesAfterInterestToggle(
  spaces: readonly string[],
  interest: Interest,
): string[] {
  if (!spaces.includes(interest)) return [...spaces, interest];
  const rest = spaces.filter((name) => name !== interest);
  return interest === VIBES_INTEREST
    ? rest.filter((name) => !isTravelVibe(name))
    : rest;
}
