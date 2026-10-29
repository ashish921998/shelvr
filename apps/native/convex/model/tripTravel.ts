import { v, type Infer } from "convex/values";

export const travelModeValidator = v.union(
  v.literal("walking"),
  v.literal("driving"),
);
export type TravelMode = Infer<typeof travelModeValidator>;
export const travelStopValidator = v.object({
  _id: v.id("tripStops"),
  lat: v.number(),
  lng: v.number(),
});
export type TravelStop = Infer<typeof travelStopValidator>;
export const travelEstimateValidator = v.object({
  seconds: v.number(),
  meters: v.number(),
});
export type TravelEstimate = Infer<typeof travelEstimateValidator>;
export const travelLegValidator = v.object({
  key: v.string(),
  estimate: v.union(v.null(), travelEstimateValidator),
});

export function travelLayout(stops: readonly TravelStop[]): string {
  return JSON.stringify(stops.map((stop) => [stop._id, stop.lat, stop.lng]));
}

export function travelLegKey(from: TravelStop, to: TravelStop): string {
  return travelLayout([from, to]);
}
