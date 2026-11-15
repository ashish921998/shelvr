import { describe, expect, it } from "vitest";

import { SAMPLE_CITY, riverPolygon, sampleCountLine } from "./sampleCity";

const UNITS_PER_KM = 39;
const MAX_WALK_KM = 1.5;
const STREET_FACTOR = 1.3;
const WALK_KMH = 4.8;

type Spot = { x: number; y: number };
type Point = [number, number];

function distance(a: Spot, b: Spot) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inside({ x, y }: Spot, polygon: Point[]) {
  let crossings = 0;
  polygon.forEach(([ax, ay], i) => {
    const [bx, by] = polygon[(i + 1) % polygon.length];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      crossings += 1;
    }
  });
  return crossings % 2 === 1;
}

function distanceToEdges({ x, y }: Spot, polygon: Point[]) {
  return Math.min(
    ...polygon.map(([ax, ay], i) => {
      const [bx, by] = polygon[(i + 1) % polygon.length];
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
      );
      return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    }),
  );
}

function pin(name: string) {
  const found = SAMPLE_CITY.pins.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No sample pin named ${name}`);
  return found;
}

describe("the sample city", () => {
  it("has 23 uniquely named pins, the newest drawn last", () => {
    const names = SAMPLE_CITY.pins.map((candidate) => candidate.name);
    expect(names).toHaveLength(23);
    expect(new Set(names).size).toBe(23);
    expect(sampleCountLine()).toBe("23 places from your saves");
    expect(SAMPLE_CITY.newest).toBe(names[names.length - 1]);
  });

  it("keeps every pin clear of the status bar, the sheet and the edges", () => {
    for (const candidate of SAMPLE_CITY.pins) {
      expect(candidate.x).toBeGreaterThanOrEqual(14);
      expect(candidate.x).toBeLessThanOrEqual(306);
      expect(candidate.y).toBeGreaterThanOrEqual(90);
      expect(candidate.y).toBeLessThanOrEqual(445);
    }
  });

  it("keeps the pins apart", () => {
    SAMPLE_CITY.pins.forEach((a, i) => {
      for (const b of SAMPLE_CITY.pins.slice(i + 1)) {
        expect(distance(a, b)).toBeGreaterThanOrEqual(24);
      }
    });
  });

  it("keeps every pin bubble out of the river", () => {
    const river = riverPolygon();
    for (const candidate of SAMPLE_CITY.pins) {
      expect(inside(candidate, river)).toBe(false);
      expect(distanceToEdges(candidate, river)).toBeGreaterThanOrEqual(11);
    }
  });

  it("lists rows for pins, with each pin's emoji", () => {
    for (const row of SAMPLE_CITY.rows) {
      expect(pin(row.name).emoji).toBe(row.emoji);
    }
  });

  it("plans the evening the way Plan a date does", () => {
    const [dinner, after] = SAMPLE_CITY.evening.stops;
    expect(dinner.slot).toBe("Dinner");
    expect(after.slot).toBe("Drinks or dessert");
    expect(pin(dinner.name).emoji).toBe("🍽️");
    expect(pin(after.name).emoji).toBe("🥐");

    const units = distance(pin(dinner.name), pin(after.name));
    expect(units).toBeLessThanOrEqual(58);
    expect(units).toBeLessThanOrEqual(MAX_WALK_KM * UNITS_PER_KM);

    const km = (units / UNITS_PER_KM) * STREET_FACTOR;
    expect(SAMPLE_CITY.evening.walkMinutes).toBe(
      Math.max(1, Math.round((km / WALK_KMH) * 60)),
    );
    expect(SAMPLE_CITY.evening.walkMinutes).toBe(13);
  });
});
