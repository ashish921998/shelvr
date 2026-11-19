import { v } from "convex/values";
import { env } from "../_generated/server";
import {
  appleMapsAccessToken,
  appleMapsConfig,
  appleMapsFind,
  appleMapsLookup,
  UNAVAILABLE,
} from "./appleMaps";
import { keepNearby, type LatLng } from "./trip";

export const reportValidator = v.object({
  added: v.number(),
  existing: v.number(),
  missed: v.array(v.string()),
});

export const storedPlaceValidator = v.object({
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  appleId: v.string(),
  category: v.optional(v.string()),
});

export type StoredPlace = {
  name: string;
  lat: number;
  lng: number;
  appleId: string;
  category?: string;
};

export async function cityCentre(city: string) {
  const name = city.trim();
  if (!name) throw new Error("city is empty");
  const config = appleMapsConfig(env);
  if (config === null) throw new Error("Apple Maps is not configured");
  const token = await appleMapsAccessToken(config);
  if (token === null) throw new Error("Apple Maps token request failed");
  const centre = await appleMapsLookup(token, "geocode", name);
  if (!centre) throw new Error(`Apple cannot place the city "${name}"`);
  return { name, token, centre: { lat: centre.lat, lng: centre.lng } };
}

export function inCity(point: LatLng, centre: LatLng): boolean {
  return keepNearby([point], centre)[0] !== null;
}

export async function findVenue(
  token: string,
  name: string,
  query: string,
  near: LatLng,
) {
  const found = await appleMapsFind(
    token,
    { target: "place", name, hasBranchClue: true, strict: true },
    query,
    near,
  );
  if (found === UNAVAILABLE)
    throw new Error("Apple Maps is unavailable; run the import again");
  return found;
}
