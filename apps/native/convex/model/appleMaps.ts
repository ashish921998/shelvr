import { signAppleJwt } from "./appleClient";

// Apple Maps Server API: where a saved place is, for the trip map. Free up to
// 25,000 calls a day per team (shared with MapKit JS); over that it answers
// 429. Runtime-agnostic: plain fetch to one fixed host, never a user URL.
const API = "https://maps-api.apple.com/v1";
const TOKEN_TIMEOUT_MS = 8_000;
const SEARCH_TIMEOUT_MS = 8_000;
/** A search reply is a few kilobytes; anything far larger is not one. */
const MAX_REPLY_BYTES = 256 * 1024;
/** A place this far from the trip's city is a different place with the same
 * name, not the one the save meant. */
export const MAX_CITY_DISTANCE_KM = 80;

export type AppleMapsConfig = {
  privateKey: string;
  keyId: string;
  teamId: string;
};

export type LatLng = { lat: number; lng: number };

export type FoundPlace = LatLng & { address?: string };

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
  try {
    const response = await fetchImpl(`${API}/token`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await readJson(response);
    const token =
      typeof body === "object" && body !== null && "accessToken" in body
        ? body.accessToken
        : undefined;
    return typeof token === "string" && token !== "" ? token : null;
  } catch {
    return null;
  }
}

/** The reply's JSON, or null when it is not JSON or is too large to be a
 * Maps reply. */
async function readJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_REPLY_BYTES) return null;
  const text = await response.text();
  if (text.length > MAX_REPLY_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The first result of a search or geocode reply that has a usable
 * coordinate. */
export function firstPlace(body: unknown): FoundPlace | null {
  if (typeof body !== "object" || body === null || !("results" in body)) {
    return null;
  }
  const results = body.results;
  if (!Array.isArray(results)) return null;
  for (const result of results as unknown[]) {
    if (typeof result !== "object" || result === null) continue;
    const coordinate = (result as { coordinate?: unknown }).coordinate;
    if (typeof coordinate !== "object" || coordinate === null) continue;
    const { latitude, longitude } = coordinate as {
      latitude?: unknown;
      longitude?: unknown;
    };
    if (!isNumber(latitude) || !isNumber(longitude)) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const lines = (result as { formattedAddressLines?: unknown })
      .formattedAddressLines;
    const address = Array.isArray(lines)
      ? lines
          .filter((line): line is string => typeof line === "string")
          .join(", ")
          .slice(0, 200)
      : "";
    return {
      lat: latitude,
      lng: longitude,
      ...(address !== "" ? { address } : {}),
    };
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
  options: { near?: LatLng; lang?: string } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<FoundPlace | null> {
  const params = new URLSearchParams({ q: query.slice(0, 200) });
  if (options.near !== undefined) {
    params.set("searchLocation", `${options.near.lat},${options.near.lng}`);
  }
  if (options.lang !== undefined) params.set("lang", options.lang);
  try {
    const response = await fetchImpl(`${API}/${kind}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return firstPlace(await readJson(response));
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
