import { z } from "zod";
import { signAppleJwt } from "./appleClient";

// Apple Maps Server API: where a saved place is, for the trip map. Free up to
// 25,000 calls a day per team (shared with MapKit JS); over that it answers
// 429. Runtime-agnostic: plain fetch to one fixed host, never a user URL.
const API = "https://maps-api.apple.com/v1";
const TOKEN_TIMEOUT_MS = 8_000;
const SEARCH_TIMEOUT_MS = 8_000;
/** A place this far from the trip's city is a different place with the same
 * name, not the one the save meant. */
export const MAX_CITY_DISTANCE_KM = 80;

export type AppleMapsConfig = {
  privateKey: string;
  keyId: string;
  teamId: string;
};

export type LatLng = { lat: number; lng: number };

/** The deployment's Maps key, or null while any of the three is unset. */
export function appleMapsConfig(env: {
  APPLE_MAPS_PRIVATE_KEY?: string;
  APPLE_MAPS_KEY_ID?: string;
  APPLE_MAPS_TEAM_ID?: string;
}): AppleMapsConfig | null {
  const privateKey = env.APPLE_MAPS_PRIVATE_KEY?.trim();
  const keyId = env.APPLE_MAPS_KEY_ID?.trim();
  const teamId = env.APPLE_MAPS_TEAM_ID?.trim();
  if (!privateKey || !keyId || !teamId) return null;
  return { privateKey, keyId, teamId };
}

/** Trades a signed auth token for a Maps access token (valid 30 minutes;
 * one trip uses it once). Null when Apple refuses or cannot be reached. */
export async function appleMapsAccessToken(
  config: AppleMapsConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    // Inside the try: a malformed key means no pins, not a failed trip.
    const issuedAt = Math.floor(Date.now() / 1000);
    const authToken = await signAppleJwt(
      config,
      {
        iss: config.teamId,
        iat: issuedAt,
        exp: issuedAt + 300,
        scope: "server_api",
      },
      { typ: "JWT" },
    );
    const response = await fetchImpl(`${API}/token`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json().catch(() => null);
    const token =
      typeof body === "object" && body !== null && "accessToken" in body
        ? body.accessToken
        : undefined;
    return typeof token === "string" && token !== "" ? token : null;
  } catch {
    return null;
  }
}

const replySchema = z.object({
  results: z.array(z.unknown()),
});
const placeSchema = z.object({
  coordinate: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
});

/** The first result of a search or geocode reply that has a usable
 * coordinate. */
export function firstPlace(body: unknown): LatLng | null {
  const reply = replySchema.safeParse(body);
  if (!reply.success) return null;
  for (const result of reply.data.results) {
    const place = placeSchema.safeParse(result);
    if (place.success) {
      const { latitude, longitude } = place.data.coordinate;
      return { lat: latitude, lng: longitude };
    }
  }
  return null;
}

/**
 * Looks one query up. `kind` "search" finds a place by name near `near`;
 * "geocode" finds a city or an address. Null when nothing matched or Apple
 * could not be reached; the 429 of a spent daily quota reads the same way.
 */
export async function appleMapsLookup(
  accessToken: string,
  kind: "search" | "geocode",
  query: string,
  near?: LatLng,
  fetchImpl: typeof fetch = fetch,
): Promise<LatLng | null> {
  const params = new URLSearchParams({ q: query.slice(0, 200) });
  if (near !== undefined) {
    params.set("searchLocation", `${near.lat},${near.lng}`);
  }
  try {
    const response = await fetchImpl(`${API}/${kind}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return firstPlace(await response.json().catch(() => null));
  } catch {
    return null;
  }
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
