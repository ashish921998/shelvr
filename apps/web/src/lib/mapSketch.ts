type LatLng = { lat: number; lng: number };

type SketchBox = { width: number; height: number; padding: number };

type SketchPoint = { x: number; y: number };

const FRAME_MIN_KM = 10;
const FRAME_SPREAD = 3;
const MIN_SPAN_DEGREES = 0.009;
const EARTH_RADIUS_KM = 6371;
const SPREAD_RINGS = 5;
const RING_STEPS = 6;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

function framed<T extends LatLng>(places: readonly T[]): readonly T[] {
  if (places.length < 3) return places;
  const middle = {
    lat: median(places.map((place) => place.lat)),
    lng: median(places.map((place) => place.lng)),
  };
  const distances = places.map((place) => distanceKm(place, middle));
  const reach = Math.max(FRAME_MIN_KM, median(distances) * FRAME_SPREAD);
  return places.filter((_, index) => distances[index] <= reach);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function insideBox(point: SketchPoint, box: SketchBox): SketchPoint {
  return {
    x: clamp(point.x, box.padding, box.width - box.padding),
    y: clamp(point.y, box.padding, box.height - box.padding),
  };
}

function isClear(
  point: SketchPoint,
  placed: readonly SketchPoint[],
  spacing: number,
): boolean {
  return placed.every(
    (other) => Math.hypot(other.x - point.x, other.y - point.y) >= spacing,
  );
}

function clearSpot(
  point: SketchPoint,
  placed: readonly SketchPoint[],
  box: SketchBox,
  spacing: number,
): SketchPoint {
  for (let ring = 1; ring <= SPREAD_RINGS; ring += 1) {
    const radius = (ring * spacing) / 2;
    const steps = ring * RING_STEPS;
    for (let step = 0; step < steps; step += 1) {
      const angle = (2 * Math.PI * step) / steps;
      const spot = insideBox(
        {
          x: point.x + radius * Math.cos(angle),
          y: point.y + radius * Math.sin(angle),
        },
        box,
      );
      if (isClear(spot, placed, spacing)) return spot;
    }
  }
  return point;
}

export function spreadPoints(
  points: readonly SketchPoint[],
  box: SketchBox,
  spacing: number,
): SketchPoint[] {
  const placed: SketchPoint[] = [];
  for (const point of points) {
    placed.push(
      isClear(point, placed, spacing)
        ? point
        : clearSpot(point, placed, box, spacing),
    );
  }
  return placed;
}

export function sketchPoints(
  places: readonly LatLng[],
  box: SketchBox,
): SketchPoint[] {
  if (places.length === 0) return [];
  const frame = framed(places);
  const lats = frame.map((place) => place.lat);
  const lngs = frame.map((place) => place.lng);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const squeeze = Math.cos(radians(lat0));
  const spanX = Math.max(
    (Math.max(...lngs) - Math.min(...lngs)) * squeeze,
    MIN_SPAN_DEGREES,
  );
  const spanY = Math.max(
    Math.max(...lats) - Math.min(...lats),
    MIN_SPAN_DEGREES,
  );
  const scale = Math.min(
    (box.width - 2 * box.padding) / spanX,
    (box.height - 2 * box.padding) / spanY,
  );
  return places.map((place) =>
    insideBox(
      {
        x: box.width / 2 + (place.lng - lng0) * squeeze * scale,
        y: box.height / 2 - (place.lat - lat0) * scale,
      },
      box,
    ),
  );
}
