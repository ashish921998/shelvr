export const BEEN_CITY_POINTS = {
  amsterdam: { lat: 52.3676, lng: 4.9041 },
  austin: { lat: 30.2672, lng: -97.7431 },
  barcelona: { lat: 41.3874, lng: 2.1686 },
  berlin: { lat: 52.52, lng: 13.405 },
  chicago: { lat: 41.8781, lng: -87.6298 },
  copenhagen: { lat: 55.6761, lng: 12.5683 },
  dallas: { lat: 32.7767, lng: -96.797 },
  florence: { lat: 43.7696, lng: 11.2558 },
  "las-vegas": { lat: 36.1699, lng: -115.1398 },
  lisbon: { lat: 38.7223, lng: -9.1393 },
  london: { lat: 51.5074, lng: -0.1278 },
  "los-angeles": { lat: 34.0522, lng: -118.2437 },
  madrid: { lat: 40.4168, lng: -3.7038 },
  milan: { lat: 45.4642, lng: 9.19 },
  montreal: { lat: 45.5019, lng: -73.5674 },
  "new-york": { lat: 40.7128, lng: -74.006 },
  paris: { lat: 48.8566, lng: 2.3522 },
  prague: { lat: 50.0755, lng: 14.4378 },
  rome: { lat: 41.9028, lng: 12.4964 },
  "san-francisco": { lat: 37.7749, lng: -122.4194 },
  seattle: { lat: 47.6062, lng: -122.3321 },
  seoul: { lat: 37.5665, lng: 126.978 },
  tokyo: { lat: 35.6895, lng: 139.6917 },
  toronto: { lat: 43.6532, lng: -79.3832 },
  vancouver: { lat: 49.2827, lng: -123.1207 },
} satisfies Record<string, { lat: number; lng: number }>;

export const BEEN_CITY_IDS = Object.keys(BEEN_CITY_POINTS).sort();

export function isBeenCityId(
  value: string,
): value is keyof typeof BEEN_CITY_POINTS {
  return Object.hasOwn(BEEN_CITY_POINTS, value);
}
