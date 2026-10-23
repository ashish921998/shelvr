import { z } from "zod";
import { signEs256Jwt } from "./appleSigning";
import type { LatLng } from "./trip";

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
  coordinate: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
});

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
