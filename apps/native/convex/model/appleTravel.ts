"use node";

import { z } from "zod";
import { safeFetch } from "./safeFetch";
import { appleMapsAccessToken, type AppleMapsConfig } from "./appleMaps";
import type { TravelEstimate, TravelMode, TravelStop } from "./tripTravel";

const API = "https://maps-api.apple.com/v1";
const MAX_REPLY_BYTES = 32_768;

async function appleJson(url: string, authorization: string): Promise<unknown> {
  const response = await safeFetch(url, {
    timeoutMs: 8_000,
    maxBytes: MAX_REPLY_BYTES,
    maxRedirects: 0,
    headers: { Authorization: authorization },
    allowContentType: (type) => type.includes("application/json"),
  });
  if (!response.ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(response.bytes));
  } catch {
    return null;
  }
}

export async function travelAccessToken(
  config: AppleMapsConfig,
): Promise<string | null> {
  return appleMapsAccessToken(config, async (_url, init) => {
    const headers = new Headers(init?.headers);
    const json = await appleJson(
      `${API}/token`,
      headers.get("Authorization") ?? "",
    );
    return Response.json(json);
  });
}

const etaSchema = z.object({
  etas: z
    .array(
      z.object({
        destination: z.object({ latitude: z.number(), longitude: z.number() }),
        transportType: z.string(),
        expectedTravelTimeSeconds: z.number().finite().nonnegative(),
        distanceMeters: z.number().finite().nonnegative(),
      }),
    )
    .max(10),
});

export async function appleTravelEstimate(
  token: string,
  from: TravelStop,
  to: TravelStop,
  mode: TravelMode,
): Promise<TravelEstimate | null> {
  const transport = mode === "walking" ? "Walking" : "Automobile";
  const params = new URLSearchParams({
    origin: `${from.lat},${from.lng}`,
    destinations: `${to.lat},${to.lng}`,
    transportType: transport,
  });
  const body = etaSchema.safeParse(
    await appleJson(`${API}/etas?${params}`, `Bearer ${token}`),
  );
  if (!body.success) return null;
  const eta = body.data.etas.find(
    (item) =>
      item.transportType.toLowerCase() === transport.toLowerCase() &&
      Math.abs(item.destination.latitude - to.lat) < 0.00001 &&
      Math.abs(item.destination.longitude - to.lng) < 0.00001,
  );
  return eta
    ? { seconds: eta.expectedTravelTimeSeconds, meters: eta.distanceMeters }
    : null;
}
