import type { Interest } from "@/lib/onboarding-interests";

// The follow-up to picking Travel on "What are you into?": what kind of spots.
// Each picked vibe becomes a starter space, like a picked topic does, named by
// its translated label (onboarding-labels.ts). The ids are stable space
// identities and stay in English, the way INTERESTS do.
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

/** The topic the vibes follow. Its card shows while it is picked. */
export const VIBES_INTEREST: Interest = "Travel";

/** The picked spaces after `interest` is picked or unpicked on the interests
 * step. Unpicking Travel hides its card, so its vibes go with it: a pick
 * nobody can see any more must not become a space. */
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
