import {
  geoBounds,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoOrthographic,
  geoPath,
} from "d3-geo";
import type { Feature, FeatureCollection, Position } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countriesData from "../../assets/world/countries-50m.json";
import landData from "../../assets/world/land-110m.json";
import { REVEAL_TIMING } from "./trip-reveal";

export type GlobeTarget = { lng: number; lat: number };

type GlobeCamera = {
  rotate: [number, number];
  scale: number;
  x: number;
  y: number;
  dive: number;
};

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
const LANDED_RADIUS = 2600;
const SPIN_LAND_STEP_DEGREES = 1.5;
const DETAIL_RADIUS = 700;
const NEARBY = 25;
const DEGREES = 180 / Math.PI;
const SPIN = 20;
const TILT = -28;
const RISE_MS = 1100;
export const GLOBE_DIVE_MS = 1100;
const NEAR_COAST = Math.PI / 180;
const EMPTY: GlobePaths = { sphere: "", graticule: "", land: "", country: "" };
const GRATICULE = geoGraticule10();

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, share: number) =>
  from + (to - from) * share;
const easeInOut = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 4);
const nearestTurn = (from: number, to: number) =>
  from + ((((to - from) % 360) + 540) % 360) - 180;

function thinRing(ring: Position[], step: number): Position[] {
  const kept = [ring[0]];
  for (let i = 1; i < ring.length - 1; i += 1) {
    const last = kept[kept.length - 1];
    const point = ring[i];
    if (Math.abs(point[0] - last[0]) + Math.abs(point[1] - last[1]) >= step) {
      kept.push(point);
    }
  }
  kept.push(ring[ring.length - 1]);
  return kept.length >= Math.min(8, ring.length) ? kept : ring;
}

export function thinLand(land: FeatureCollection, step: number): Feature {
  const coordinates = land.features
    .flatMap(({ geometry }) => {
      if (geometry.type === "Polygon") return [geometry.coordinates];
      if (geometry.type === "MultiPolygon") return geometry.coordinates;
      return [];
    })
    .map((polygon) => polygon.map((ring) => thinRing(ring, step)));
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiPolygon", coordinates },
  };
}

let world: {
  land: FeatureCollection;
  spinLand: Feature;
  countries: Feature[];
  bounds: number[][][];
};
function loadWorld() {
  if (!world) {
    const land = landData as unknown as Topology<{ land: GeometryCollection }>;
    const countries = countriesData as unknown as Topology<{
      countries: GeometryCollection;
    }>;
    const features = feature(countries, countries.objects.countries).features;
    const outline = feature(land, land.objects.land);
    world = {
      land: outline,
      spinLand: thinLand(outline, SPIN_LAND_STEP_DEGREES),
      countries: features,
      bounds: features.map((country) => geoBounds(country)),
    };
  }
  return world;
}

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
  const lng = median(pins.map((pin) => nearestTurn(pins[0].lng, pin.lng)));
  return {
    lng: ((((lng + 180) % 360) + 360) % 360) - 180,
    lat: median(pins.map((pin) => pin.lat)),
  };
}

const spinAt = (t: number) => (SPIN * t) / 1000;

export function diveTarget(target: GlobeTarget | null, diveAt: number) {
  return target ?? { lng: -spinAt(diveAt), lat: -TILT };
}

/** The camera `t` ms into the reveal; `diveAt` is when the dive starts, or null while the globe still spins. */
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

export function globeRegion(target: GlobeTarget): GlobeRegion {
  const { countries, bounds } = loadWorld();
  const point: [number, number] = [target.lng, target.lat];
  const edge = Math.min(89, Math.abs(target.lat) + NEARBY) / DEGREES;
  const span = Math.min(180, NEARBY / Math.cos(edge));
  const near = ([[west, south], [east, north]]: number[][]) => {
    if (north < target.lat - NEARBY || south > target.lat + NEARBY) {
      return false;
    }
    // geoBounds gives a box across the antimeridian a west edge east of its east edge.
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

// The simplified map loses estuaries, so a coastal city can fall just outside its country.
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

export const countryLight = (dive: number) => clamp((dive - 0.5) / 0.4);

/** True when the detailed map, which holds only countries near the target, covers everything on screen. */
export function closeUp(
  camera: GlobeCamera,
  screen: { width: number; height: number },
  region: GlobeRegion,
) {
  if (camera.scale <= DETAIL_RADIUS) return false;
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

/** SVG paths for one frame, clipped to the screen; empty strings when there is nothing to draw. */
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
    .precision(camera.scale > DETAIL_RADIUS ? 0.5 : 1);
  const path = geoPath(projection);
  const close = region !== null && closeUp(camera, screen, region);
  const atlas = loadWorld();
  const land = close
    ? region.nearby
    : camera.dive === 0
      ? atlas.spinLand
      : atlas.land;
  return {
    sphere: path({ type: "Sphere" }) ?? "",
    graticule: path(GRATICULE) ?? "",
    land: path(land) ?? "",
    country:
      region?.country && countryLight(camera.dive) > 0
        ? (path(region.country) ?? "")
        : "",
  };
}

/** Where the target sits on screen; held on the globe's edge while it is on the far side. */
export function globePin(
  camera: GlobeCamera,
  target: GlobeTarget,
): { x: number; y: number } {
  const [x, y] = geoOrthographic()
    .rotate(camera.rotate)
    .scale(camera.scale)
    .translate([camera.x, camera.y])([target.lng, target.lat]) ?? [
    camera.x,
    camera.y,
  ];
  const facing: [number, number] = [-camera.rotate[0], -camera.rotate[1]];
  if (geoDistance(facing, [target.lng, target.lat]) < Math.PI / 2) {
    return { x, y };
  }
  const away = Math.hypot(x - camera.x, y - camera.y);
  if (away < 1e-6) return { x: camera.x, y: camera.y - camera.scale };
  return {
    x: camera.x + ((x - camera.x) / away) * camera.scale,
    y: camera.y + ((y - camera.y) / away) * camera.scale,
  };
}

export const warmGlobe = () => void loadWorld();

export const globeSettled = (t: number, diveAt: number | null) =>
  diveAt !== null && t >= diveAt + GLOBE_DIVE_MS;
