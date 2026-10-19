// Trip Reveal's globe: a real world map, drawn as seen from space. It spins
// while the trip is built, then turns to the trip's city and zooms in until
// the city's country fills the screen. Pure, so every frame can be tested;
// the reveal draws the paths it returns with Skia.
import {
  geoBounds,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoOrthographic,
  geoPath,
} from "d3-geo";
import type { Feature, FeatureCollection } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countriesData from "../../assets/world/countries-50m.json";
import landData from "../../assets/world/land-110m.json";
import { REVEAL_TIMING } from "./trip-reveal";

export type GlobeTarget = { lng: number; lat: number };

/** Where the globe is turned to, how big it is, and where its centre sits. */
type GlobeCamera = {
  rotate: [number, number];
  scale: number;
  x: number;
  y: number;
  /** How far the dive into the city has gone, 0 to 1. */
  dive: number;
};

/** The countries drawn once the globe is close, and the one to light up. */
export type GlobeRegion = {
  center: GlobeTarget;
  nearby: FeatureCollection;
  country: Feature | null;
};

export type GlobePaths = {
  sphere: string;
  graticule: string;
  land: string;
  country: string;
};

const RADIUS = 230;
/** The radius once landed: about a country's width across the screen. */
const LANDED_RADIUS = 2600;
/** Above this the detailed map may take over from the coarse one. */
const DETAIL_RADIUS = 700;
/** Degrees round the target the detailed map covers. */
const NEARBY = 25;
const DEGREES = 180 / Math.PI;
/** Degrees a second while the trip is built. */
const SPIN = 20;
/** Tipped so the northern hemisphere, where most trips go, faces the screen. */
const TILT = -28;
const RISE_MS = 1100;
export const GLOBE_DIVE_MS = 1100;
/** About 1°, in radians. */
const NEAR_COAST = Math.PI / 180;
const EMPTY: GlobePaths = { sphere: "", graticule: "", land: "", country: "" };
const GRATICULE = geoGraticule10();

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, share: number) =>
  from + (to - from) * share;
// The camera moves like the Maps fly-to: slow out, fast across, slow in.
const easeInOut = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 4);
/** `to`, moved by whole turns so it is at most 180° from `from`. */
const nearestTurn = (from: number, to: number) =>
  from + ((((to - from) % 360) + 540) % 360) - 180;

let world: { land: Feature; countries: Feature[]; bounds: number[][][] };
function loadWorld() {
  if (!world) {
    const land = landData as unknown as Topology<{ land: GeometryCollection }>;
    const countries = countriesData as unknown as Topology<{
      countries: GeometryCollection;
    }>;
    const features = feature(countries, countries.objects.countries).features;
    world = {
      land: feature(land, land.objects.land) as unknown as Feature,
      countries: features,
      bounds: features.map((country) => geoBounds(country)),
    };
  }
  return world;
}

/** The middle of a trip's stops, which the globe dives into. Null when no
 * stop has a pin. The median, so one far-off stop cannot pull it away. */
export function tripCenter(
  days: readonly { stops: readonly { lat?: number; lng?: number }[] }[] = [],
): GlobeTarget | null {
  const pins = days
    .flatMap((day) => day.stops)
    .filter(
      (stop): stop is { lat: number; lng: number } =>
        stop.lat !== undefined && stop.lng !== undefined,
    );
  if (pins.length === 0) return null;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  return {
    lng: median(pins.map((pin) => pin.lng)),
    lat: median(pins.map((pin) => pin.lat)),
  };
}

/** The spin's longitude `t` ms into the reveal. */
const spinAt = (t: number) => (SPIN * t) / 1000;

/** The point the dive lands on: the target, or with no pins whatever faces
 * the screen when the dive starts. */
export function diveTarget(target: GlobeTarget | null, diveAt: number) {
  return target ?? { lng: -spinAt(diveAt), lat: -TILT };
}

/** The camera `t` ms into the reveal. The globe rises with the dots, spins
 * while the trip is built and, from `diveAt`, turns to the target and zooms
 * in until the target sits on the landing point, the screen's centre. */
export function globeCamera({
  t,
  diveAt,
  width,
  height,
  target,
}: {
  t: number;
  diveAt: number | null;
  width: number;
  height: number;
  target: GlobeTarget | null;
}): GlobeCamera {
  const below = height + 56 + 250;
  const risen = below - (440 * height) / 844;
  const rise = easeOut(clamp((t - REVEAL_TIMING.dots) / RISE_MS));
  const y = lerp(below, risen, rise);
  if (diveAt === null) {
    return {
      rotate: [spinAt(t), TILT],
      scale: RADIUS,
      x: width / 2,
      y,
      dive: 0,
    };
  }
  const dive = easeInOut(clamp((t - diveAt) / GLOBE_DIVE_MS));
  const from = spinAt(diveAt);
  const land = diveTarget(target, diveAt);
  return {
    rotate: [
      lerp(from, nearestTurn(from, -land.lng), dive),
      lerp(TILT, -land.lat, dive),
    ],
    scale: RADIUS * Math.pow(LANDED_RADIUS / RADIUS, dive),
    x: width / 2,
    y: lerp(y, height / 2, dive),
    dive,
  };
}

/** The countries near the target, and the one it is in, for the close-up. */
export function globeRegion(target: GlobeTarget): GlobeRegion {
  const { countries, bounds } = loadWorld();
  const point: [number, number] = [target.lng, target.lat];
  // Every point within NEARBY degrees: meridians close in towards the poles,
  // so the box is wider in longitude the further north or south it reaches.
  const edge = Math.min(89, Math.abs(target.lat) + NEARBY) / DEGREES;
  const span = Math.min(180, NEARBY / Math.cos(edge));
  const near = ([[west, south], [east, north]]: number[][]) => {
    if (north < target.lat - NEARBY || south > target.lat + NEARBY) {
      return false;
    }
    // A box across the antimeridian has its west edge east of its east edge.
    if (west > east || span === 180) return true;
    return [-360, 0, 360].some(
      (turn) =>
        west + turn <= target.lng + span && east + turn >= target.lng - span,
    );
  };
  return {
    center: target,
    nearby: {
      type: "FeatureCollection",
      features: countries.filter((_, index) => near(bounds[index])),
    },
    country:
      countries.find((country) => geoContains(country, point)) ??
      coastalCountry(point),
  };
}

/** The simplified map loses estuaries, so a coastal city like Lisbon can
 * fall just outside its country: take the one with a border point within
 * about 1° instead, and none out at sea. */
function coastalCountry(point: [number, number]): Feature | null {
  const { countries, bounds } = loadWorld();
  let best: Feature | null = null;
  let nearest = NEAR_COAST;
  countries.forEach((country, index) => {
    const [[west, south], [east, north]] = bounds[index];
    if (point[1] < south - 1 || point[1] > north + 1) return;
    if (west <= east && (point[0] < west - 1 || point[0] > east + 1)) return;
    const geometry = country.geometry;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return;
    const rings =
      geometry.type === "Polygon"
        ? geometry.coordinates
        : geometry.coordinates.flat();
    for (const vertex of rings.flat()) {
      const distance = geoDistance(point, vertex as [number, number]);
      if (distance < nearest) {
        nearest = distance;
        best = country;
      }
    }
  });
  return best;
}

/** How lit the target's country is, 0 to 1, as the dive closes in. */
export const countryLight = (dive: number) => clamp((dive - 0.5) / 0.4);

/** Whether the detailed map covers everything on screen. It holds only
 * countries near the target, so while the camera is still turning towards
 * it, the coarse map has to stay or land would vanish. */
export function closeUp(
  camera: GlobeCamera,
  screen: { width: number; height: number },
  region: GlobeRegion,
) {
  if (camera.scale <= DETAIL_RADIUS) return false;
  // The farthest corner from the globe's centre, in degrees of arc.
  const reach = Math.hypot(
    screen.width / 2 + Math.abs(camera.x - screen.width / 2),
    screen.height / 2 + Math.abs(camera.y - screen.height / 2),
  );
  const view = Math.asin(Math.min(1, reach / camera.scale)) * DEGREES;
  const facing: [number, number] = [-camera.rotate[0], -camera.rotate[1]];
  const off =
    geoDistance(facing, [region.center.lng, region.center.lat]) * DEGREES;
  return off + view < NEARBY;
}

/** SVG paths for one frame, clipped to the screen. Empty strings while the
 * globe is still below the screen, and for no country. */
export function globePaths(
  camera: GlobeCamera,
  screen: { width: number; height: number },
  region: GlobeRegion | null,
): GlobePaths {
  if (camera.y - camera.scale > screen.height) return EMPTY;
  const projection = geoOrthographic()
    .rotate(camera.rotate)
    .scale(camera.scale)
    .translate([camera.x, camera.y])
    .clipAngle(90)
    .clipExtent([
      [-8, -8],
      [screen.width + 8, screen.height + 8],
    ])
    // Coarser while the whole globe is in view: it is small, and spinning.
    .precision(camera.scale > DETAIL_RADIUS ? 0.5 : 1);
  const path = geoPath(projection);
  const close = region !== null && closeUp(camera, screen, region);
  return {
    sphere: path({ type: "Sphere" }) ?? "",
    graticule: path(GRATICULE) ?? "",
    land: path(close ? region.nearby : loadWorld().land) ?? "",
    country:
      region?.country && countryLight(camera.dive) > 0
        ? (path(region.country) ?? "")
        : "",
  };
}

/** Parses the map ahead of its first frame, so that frame does not stall. */
export const warmGlobe = () => void loadWorld();

/** Whether the globe has stopped moving, so frames can stop. */
export const globeSettled = (t: number, diveAt: number | null) =>
  diveAt !== null && t >= diveAt + GLOBE_DIVE_MS;
