type Pin = { id: string; lat: number; lng: number };

export type MapPin = Pin & {
  name: string;
  emoji?: string;
  title?: string;
  text?: string;
  tintColor?: string;
};

const MARKER_SPACING = 56;
const MAX_LATITUDE = 85.051129;

function project(pin: Pin, worldWidth: number) {
  const latitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, pin.lat));
  const sine = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((pin.lng + 180) / 360) * worldWidth,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * worldWidth,
  };
}

export function clusterMapPins<T extends Pin>(
  pins: readonly T[],
  worldWidth: number,
) {
  const groups: { x: number; y: number; pins: T[] }[] = [];
  for (const pin of [...pins].sort((a, b) => a.id.localeCompare(b.id))) {
    const next = { ...project(pin, worldWidth), pins: [pin] };
    let index: number;
    while (
      (index = groups.findIndex((group) => {
        const dx =
          group.x -
          next.x -
          Math.round((group.x - next.x) / worldWidth) * worldWidth;
        return Math.hypot(dx, group.y - next.y) < MARKER_SPACING;
      })) !== -1
    ) {
      const previous = groups.splice(index, 1)[0]!;
      const count = next.pins.length + previous.pins.length;
      const x =
        previous.x +
        Math.round((next.x - previous.x) / worldWidth) * worldWidth;
      next.x = (next.x * next.pins.length + x * previous.pins.length) / count;
      next.y =
        (next.y * next.pins.length + previous.y * previous.pins.length) / count;
      next.pins.push(...previous.pins);
    }
    groups.push(next);
  }
  return groups.map((group) => {
    const pins = group.pins.sort((a, b) => a.id.localeCompare(b.id));
    return {
      id:
        pins.length === 1
          ? pins[0]!.id
          : `cluster:${JSON.stringify(pins.map((pin) => pin.id))}`,
      pins,
      lat:
        (Math.atan(Math.sinh(Math.PI * (1 - (2 * group.y) / worldWidth))) *
          180) /
        Math.PI,
      lng: (((((group.x / worldWidth) * 360) % 360) + 360) % 360) - 180,
    };
  });
}
