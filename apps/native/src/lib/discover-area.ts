export type MapBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export const WORLD_BOX: MapBox = {
  west: -180,
  south: -85,
  east: 180,
  north: 85,
};

export type CameraView = {
  latitude: number;
  longitude: number;
  zoom: number;
  tilt?: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
};

type ScreenView = { width: number; height: number; apple: boolean };

const WORLD_WIDTH = 256;
const MAX_LATITUDE = 85;
const MIN_HALF_SPAN = 1e-6;
const WORLD_SPAN = 180;

function standardZoom(camera: CameraView, screen: ScreenView): number {
  if (!screen.apple) return camera.zoom;
  const cos = Math.cos((camera.latitude * Math.PI) / 180);
  return (
    camera.zoom +
    Math.log2(Math.min(screen.width, screen.height * cos) / WORLD_WIDTH)
  );
}

function snapped(centre: number, half: number): [number, number] {
  const step = 2 ** Math.ceil(Math.log2(Math.max(half, MIN_HALF_SPAN) / 2));
  const cell = Math.floor(centre / step);
  const reach = Math.ceil(half / step);
  return [(cell - reach) * step, (cell + 1 + reach) * step];
}

function spanHalf(delta: number | undefined, tilted: boolean): number {
  if (delta === undefined || !Number.isFinite(delta)) return 0;
  return tilted ? delta : delta / 2;
}

export function visibleBox(
  camera: CameraView,
  screen: ScreenView,
): MapBox | undefined {
  const numbers = [
    camera.latitude,
    camera.longitude,
    camera.zoom,
    screen.width,
    screen.height,
  ];
  if (!numbers.every(Number.isFinite) || screen.width <= 0) return undefined;
  const latitude = Math.max(
    -MAX_LATITUDE,
    Math.min(MAX_LATITUDE, camera.latitude),
  );
  const degreesPerPoint =
    360 / (WORLD_WIDTH * 2 ** standardZoom(camera, screen));
  const tilted = (camera.tilt ?? 0) > 0;
  const [west, east] = snapped(
    camera.longitude,
    Math.max(
      (screen.width / 2) * degreesPerPoint,
      spanHalf(camera.longitudeDelta, tilted),
    ),
  );
  if (east - west >= WORLD_SPAN) return WORLD_BOX;
  const [south, north] = snapped(
    latitude,
    Math.max(
      (screen.height / 2) *
        degreesPerPoint *
        Math.cos((latitude * Math.PI) / 180),
      spanHalf(camera.latitudeDelta, tilted),
    ),
  );
  return {
    west,
    south: Math.max(-MAX_LATITUDE, south),
    east,
    north: Math.min(MAX_LATITUDE, north),
  };
}

export function sameBox(a: MapBox | undefined, b: MapBox | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.west === b.west &&
    a.south === b.south &&
    a.east === b.east &&
    a.north === b.north
  );
}
