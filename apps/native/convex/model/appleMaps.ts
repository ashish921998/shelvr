import { z } from "zod";
import { signEs256Jwt } from "./appleSigning";
import { keepNearby, type LatLng } from "./trip";

const API = "https://maps-api.apple.com/v1";
const TOKEN_TIMEOUT_MS = 8_000;
const SEARCH_TIMEOUT_MS = 8_000;

export type AppleMapsConfig = {
  privateKey: string;
  keyId: string;
  teamId: string;
};

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

export async function appleMapsAccessToken(
  config: AppleMapsConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const issuedAt = Math.floor(Date.now() / 1000);
    const authToken = await signEs256Jwt(
      config.privateKey,
      { kid: config.keyId, typ: "JWT" },
      {
        iss: config.teamId,
        iat: issuedAt,
        exp: issuedAt + 300,
        scope: "server_api",
      },
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
  name: z.string().optional(),
  structuredAddress: z
    .object({
      locality: z.string().optional(),
      thoroughfare: z.string().optional(),
    })
    .optional(),
  id: z.string().min(1).optional(),
  poiCategory: z.string().min(1).optional(),
  coordinate: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
});

/** Apple's `poiCategory` (Restaurant, Cafe, Bakery...) rides along when the result is a point of interest. */
type FoundPlace = LatLng & {
  city?: string;
  appleId?: string;
  category?: string;
};

export function firstPlace(
  body: unknown,
  near?: LatLng,
  skipCityOnly = false,
  includeCity = false,
): FoundPlace | null {
  const reply = replySchema.safeParse(body);
  if (!reply.success) return null;
  for (const result of reply.data.results) {
    const place = placeSchema.safeParse(result);
    if (place.success) {
      const { name, structuredAddress: address } = place.data;
      if (
        skipCityOnly &&
        address?.locality &&
        !address.thoroughfare &&
        name?.trim().toLowerCase() === address.locality.trim().toLowerCase()
      )
        continue;
      const { latitude, longitude } = place.data.coordinate;
      const point = { lat: latitude, lng: longitude };
      if (near && keepNearby([point], near)[0] === null) continue;
      return {
        ...point,
        ...(includeCity && address?.locality?.trim()
          ? { city: address.locality.trim() }
          : {}),
        ...(place.data.id ? { appleId: place.data.id } : {}),
        ...(place.data.poiCategory ? { category: place.data.poiCategory } : {}),
      };
    }
  }
  return null;
}

export async function appleMapsLookup(
  accessToken: string,
  kind: "search" | "geocode",
  query: string,
  near?: LatLng,
  fetchImpl: typeof fetch = fetch,
  includeCity = false,
): Promise<FoundPlace | null> {
  const params = new URLSearchParams({ q: query.slice(0, 200) });
  if (near !== undefined) {
    params.set("searchLocation", `${near.lat},${near.lng}`);
  }
  try {
    // Preserve exact street addresses. If Apple answers with only a city centre,
    // retry as a point of interest instead of pretending that centre is the place.
    for (const filter of kind === "search" ? ["Poi,Address", "Poi"] : [""]) {
      if (filter) params.set("resultTypeFilter", filter);
      const response = await fetchImpl(`${API}/${kind}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const found = firstPlace(
        await response.json().catch(() => null),
        near,
        kind === "search",
        includeCity,
      );
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}

const poiSchema = z.object({
  name: z.string().trim().min(1),
  structuredAddress: z
    .object({
      locality: z.string().optional(),
      subLocality: z.string().optional(),
      dependentLocalities: z.array(z.string()).optional(),
    })
    .optional(),
  id: z.string().min(1).optional(),
  poiCategory: z.string().min(1).optional(),
  coordinate: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
});

const MAX_POI_NAME_CHARS = 80;
const MAX_POI_AREA_CHARS = 60;
/** Apple answers at most about ten results a search; more than this is not trusted. */
const MAX_POI_RESULTS = 15;

export type ApplePoi = LatLng & {
  name: string;
  appleId?: string;
  category?: string;
  /** The neighbourhood, else the town, from Apple's structured address. */
  area?: string;
};

/** Every usable point of interest in an Apple `/v1/search` reply, in Apple's order. */
export function placesOf(body: unknown): ApplePoi[] {
  const reply = replySchema.safeParse(body);
  if (!reply.success) return [];
  const places: ApplePoi[] = [];
  for (const result of reply.data.results.slice(0, MAX_POI_RESULTS)) {
    const place = poiSchema.safeParse(result);
    if (!place.success) continue;
    const { name, structuredAddress: address, id, poiCategory } = place.data;
    const area = (
      address?.subLocality ??
      address?.dependentLocalities?.[0] ??
      address?.locality
    )?.trim();
    places.push({
      name: name.slice(0, MAX_POI_NAME_CHARS),
      lat: place.data.coordinate.latitude,
      lng: place.data.coordinate.longitude,
      ...(id ? { appleId: id } : {}),
      ...(poiCategory ? { category: poiCategory } : {}),
      ...(area ? { area: area.slice(0, MAX_POI_AREA_CHARS) } : {}),
    });
  }
  return places;
}

/** Points of interest of `categories` for `query` around `near`; empty on any failure. */
export async function appleMapsSearchPlaces(
  accessToken: string,
  query: string,
  options: { near: LatLng; categories?: readonly string[]; lang?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ApplePoi[]> {
  const params = new URLSearchParams({
    q: query.slice(0, 200),
    searchLocation: `${options.near.lat},${options.near.lng}`,
    resultTypeFilter: "Poi",
  });
  if (options.categories !== undefined && options.categories.length > 0) {
    params.set("includePoiCategories", options.categories.join(","));
  }
  if (options.lang !== undefined) params.set("lang", options.lang);
  try {
    const response = await fetchImpl(`${API}/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    return placesOf(await response.json().catch(() => null));
  } catch {
    return [];
  }
}
