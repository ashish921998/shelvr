export const TRAVEL_VIBES = [
  "Good food",
  "Aesthetic cafés",
  "Date nights",
  "Hidden gems",
  "Going out",
] as const;
type TravelVibe = (typeof TRAVEL_VIBES)[number];

export function isTravelVibe(value: string): value is TravelVibe {
  return TRAVEL_VIBES.some((vibe) => vibe === value);
}
