import type { AppleMapsConfig } from "./appleMaps";
import { signEs256 } from "./appleSigning";
import { errorName, logEvent } from "./log";

const SNAPSHOT = "https://snapshot.apple-mapkit.com";
const MAX_PINS = 20;
const CITY_ZOOM = "10";
const LINK_TTL_S = 3_600;
const PIN_COLOR = "c05a3a";

export type MapDot = { lat: number; lng: number };

export async function passportMapUrl(
  config: AppleMapsConfig,
  dots: readonly MapDot[],
  now = Date.now(),
): Promise<string | undefined> {
  const pins = dots.slice(0, MAX_PINS).map(({ lat, lng }) => `${lat},${lng}`);
  const [first] = pins;
  if (first === undefined) return undefined;
  const one = pins.length === 1;
  const params = new URLSearchParams({
    center: one ? first : "auto",
    ...(one ? { z: CITY_ZOOM } : {}),
    size: "560x300",
    scale: "2",
    t: "mutedStandard",
    colorScheme: "light",
    poi: "0",
    annotations: JSON.stringify(
      pins.map((point) => ({
        point,
        color: PIN_COLOR,
        markerStyle: "balloon",
      })),
    ),
    expires: String(Math.floor(now / 1000) + LINK_TTL_S),
    teamId: config.teamId,
    keyId: config.keyId,
  });
  const path = `/api/v1/snapshot?${params}`;
  try {
    return `${SNAPSHOT}${path}&signature=${await signEs256(config.privateKey, path)}`;
  } catch (error) {
    logEvent("warn", "passport_map_unavailable", { error: errorName(error) });
    return undefined;
  }
}
