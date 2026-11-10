import { z } from "zod";
import { signEs256Jwt } from "./appleSigning";
import { logEvent } from "./log";
import { placeKey } from "./plan";
import { keepNearby, type LatLng } from "./trip";

const API = "https://maps-api.apple.com/v1";
const TOKEN_TIMEOUT_MS = 8_000;
const SEARCH_TIMEOUT_MS = 8_000;

export const UNAVAILABLE = "unavailable";

function isTemporary(status: number): boolean {
  return status === 429 || status >= 500;
}

function reportUnavailable(
  path: "token" | "search" | "geocode",
  failure: { status: number } | { error: unknown },
): void {
  const name =
    "error" in failure &&
    typeof failure.error === "object" &&
    failure.error !== null &&
    "name" in failure.error
      ? String(failure.error.name)
      : undefined;
  const category =
    "status" in failure
      ? failure.status === 429
        ? "rate_limited"
        : "server_error"
      : name === "TimeoutError"
        ? "timeout"
        : "network";
  logEvent("warn", "apple_maps_unavailable", {
    path,
    category,
    status: "status" in failure ? failure.status : null,
    error: name,
  });
}

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
    if (!response.ok) {
      if (isTemporary(response.status))
        reportUnavailable("token", { status: response.status });
      return null;
    }
    const body: unknown = await response.json().catch(() => null);
    const token =
      typeof body === "object" && body !== null && "accessToken" in body
        ? body.accessToken
        : undefined;
    return typeof token === "string" && token !== "" ? token : null;
  } catch (error) {
    reportUnavailable("token", { error });
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
      subLocality: z.string().optional(),
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

type SavedLookup = {
  target: "place" | "address" | "locality";
  name: string;
  hasBranchClue?: boolean;
};

const ADDRESS_ABBREVIATIONS = new Map([
  ["n", "north"],
  ["s", "south"],
  ["e", "east"],
  ["w", "west"],
  ["ave", "avenue"],
  ["blvd", "boulevard"],
  ["dr", "drive"],
  ["ln", "lane"],
  ["rd", "road"],
  ["st", "street"],
]);

function streetKey(value: string): string {
  return placeKey(
    value
      .toLowerCase()
      .replace(
        /\b\p{L}+\b/gu,
        (word) => ADDRESS_ABBREVIATIONS.get(word) ?? word,
      ),
  );
}

function matchesSavedPlace(
  place: z.infer<typeof placeSchema>,
  lookup: SavedLookup,
  filter: string,
): boolean {
  const { name, structuredAddress: address, poiCategory } = place;
  const expected = placeKey(lookup.name);
  const labelMatches = !!name && placeKey(name) === expected;
  if (filter === "Poi") return labelMatches;
  if (filter === "Address" && poiCategory) return false;
  if (filter === "Address" && lookup.target === "address") {
    const [street] = lookup.name.split(",", 1);
    return (
      labelMatches ||
      (!!address?.thoroughfare &&
        !!name &&
        streetKey(name) === streetKey(street))
    );
  }
  return (
    labelMatches ||
    (!poiCategory &&
      !address?.thoroughfare &&
      [address?.subLocality, address?.locality].some(
        (area) => area && placeKey(area) === expected,
      ))
  );
}

function isRankedPoi(place: z.infer<typeof placeSchema>): boolean {
  return (
    !!place.poiCategory ||
    (!!place.id && !place.structuredAddress?.thoroughfare) ||
    (!place.name && !place.structuredAddress)
  );
}

function hasExtendedVenueName(
  name: string | undefined,
  savedName: string,
): boolean {
  if (!name) return false;
  const expected = placeKey(savedName);
  if (expected === "" || placeKey(name) === expected) return false;
  for (const word of name.matchAll(/[\p{L}\p{M}\p{N}'’]+/gu)) {
    const end = word.index + word[0].length;
    if (placeKey(name.slice(0, end)) === expected) return true;
  }
  return false;
}

function preferredSavedPlace(
  place: z.infer<typeof placeSchema>,
  lookup: SavedLookup,
  filter: string,
): boolean {
  const mixed = filter === "Poi,Address";
  const venue = !!place.poiCategory || (!!place.id && !place.structuredAddress);
  if (mixed && !venue) return false;
  return (
    matchesSavedPlace(place, lookup, filter) ||
    (lookup.hasBranchClue === true &&
      venue &&
      (mixed || filter === "Poi") &&
      hasExtendedVenueName(place.name, lookup.name))
  );
}

export function firstPlace(
  body: unknown,
  near?: LatLng,
  skipCityOnly = false,
  includeCity = false,
  accepts?: (place: z.infer<typeof placeSchema>) => boolean,
): FoundPlace | null {
  const reply = replySchema.safeParse(body);
  if (!reply.success) return null;
  for (const result of reply.data.results) {
    const place = placeSchema.safeParse(result);
    if (place.success) {
      const { name, structuredAddress: address } = place.data;
      if (accepts && !accepts(place.data)) continue;
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

function appleGet(
  accessToken: string,
  path: "search" | "geocode",
  params: URLSearchParams,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(`${API}/${path}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
}

export async function appleMapsFind(
  accessToken: string,
  kind: "search" | "geocode" | SavedLookup,
  query: string,
  near?: LatLng,
  fetchImpl: typeof fetch = fetch,
  includeCity = false,
): Promise<FoundPlace | null | typeof UNAVAILABLE> {
  const params = new URLSearchParams({ q: query.slice(0, 200) });
  if (near !== undefined) {
    params.set("searchLocation", `${near.lat},${near.lng}`);
  }
  const path = kind === "geocode" ? "geocode" : "search";
  const saved = typeof kind === "object" ? kind : null;
  const filters = saved
    ? {
        place: ["Poi,Address", "Poi"],
        address: ["Address", "Poi,Address", "Poi"],
        locality: ["Address"],
      }[saved.target]
    : path === "search"
      ? ["Poi,Address", "Poi"]
      : [""];
  let ranked: FoundPlace | null = null;
  let geographic: FoundPlace | null = null;
  for (const filter of filters) {
    if (filter) params.set("resultTypeFilter", filter);
    let body: unknown;
    try {
      const response = await appleGet(accessToken, path, params, fetchImpl);
      if (!response.ok) {
        if (!isTemporary(response.status)) return geographic ?? ranked;
        reportUnavailable(path, { status: response.status });
        return geographic ?? UNAVAILABLE;
      }
      body = await response.json().catch((error: unknown) => {
        if (error instanceof SyntaxError) return null;
        throw error;
      });
    } catch (error) {
      reportUnavailable(path, { error });
      return geographic ?? UNAVAILABLE;
    }
    const mixed = filter === "Poi,Address";
    const matches = saved
      ? (place: z.infer<typeof placeSchema>) =>
          matchesSavedPlace(place, saved, filter)
      : undefined;
    const found = firstPlace(
      body,
      near,
      path === "search" && saved === null,
      includeCity,
      saved ? (place) => preferredSavedPlace(place, saved, filter) : undefined,
    );
    if (found) return found;
    if (saved && mixed) {
      geographic = firstPlace(body, near, false, includeCity, matches);
      if (saved.target === "place")
        ranked = firstPlace(body, near, true, includeCity, isRankedPoi);
    }
    if (saved?.target === "address" && filter === "Poi") {
      const extended = firstPlace(
        body,
        near,
        true,
        includeCity,
        (place) =>
          !!place.poiCategory && hasExtendedVenueName(place.name, saved.name),
      );
      return geographic ?? extended;
    }
  }
  return geographic ?? ranked;
}

export async function appleMapsLookup(
  ...args: Parameters<typeof appleMapsFind>
): Promise<FoundPlace | null> {
  const found = await appleMapsFind(...args);
  return found === UNAVAILABLE ? null : found;
}

const poiSchema = placeSchema.extend({
  name: z.string().trim().min(1),
  structuredAddress: z
    .object({
      locality: z.string().optional(),
      subLocality: z.string().optional(),
      dependentLocalities: z.array(z.string()).optional(),
    })
    .optional(),
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
    const response = await appleGet(accessToken, "search", params, fetchImpl);
    if (!response.ok) {
      if (isTemporary(response.status))
        reportUnavailable("search", { status: response.status });
      return [];
    }
    return placesOf(await response.json().catch(() => null));
  } catch (error) {
    reportUnavailable("search", { error });
    return [];
  }
}
