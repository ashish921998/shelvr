import { expect, it } from "vitest";
import { assert, property, array, integer } from "fast-check";
import { clusterMapPins } from "./map-pin-clusters";

const pin = (id: string, lng: number, lat = 0) => ({ id, lng, lat });

it("replaces a native marker when its grouped membership changes", () => {
  const pins = [pin("a", 0), pin("b", 1), pin("c", 10)];
  const overview = clusterMapPins(pins, 360)[0]!;
  const closer = clusterMapPins(pins, 3600).find(
    (group) => group.pins.length === 2,
  )!;
  const individual = clusterMapPins(pins, 36000).find(
    (group) => group.pins[0]!.id === "a",
  )!;
  expect(overview.pins).toHaveLength(3);
  expect(overview.id).not.toBe(closer.id);
  expect(closer.id).not.toBe(individual.id);
  expect(individual.id).toBe("a");
  expect(clusterMapPins([...pins].reverse(), 360)[0]!.id).toBe(overview.id);
});

it("combines nearby pins at overview scale and separates them when zoomed in", () => {
  const pins = [pin("a", 0), pin("b", 1), pin("c", 20)];
  expect(clusterMapPins(pins, 3600).map((group) => group.pins.length)).toEqual([
    2, 1,
  ]);
  expect(clusterMapPins(pins, 36000).map((group) => group.pins.length)).toEqual(
    [1, 1, 1],
  );
});

it("preserves every place at identical coordinates and is independent of input order", () => {
  const pins = [pin("a", 0), pin("b", 0), pin("c", 0)];
  const groups = clusterMapPins(pins, 36000);
  expect(groups).toHaveLength(1);
  expect(groups[0]!.pins).toEqual(pins);
  expect(clusterMapPins([...pins].reverse(), 36000)).toEqual(groups);
  expect(pins.map((pin) => pin.id)).toEqual(["a", "b", "c"]);
  expect(clusterMapPins([], 3600)).toEqual([]);
});

it("combines neighbours across the date line without putting their marker at Greenwich", () => {
  const groups = clusterMapPins([pin("a", 179.9), pin("b", -179.9)], 3600);
  expect(groups).toHaveLength(1);
  expect(Math.abs(groups[0]!.lng)).toBeCloseTo(180);
});

it("never leaves count markers overlapping after their centres move during grouping", () => {
  assert(
    property(
      array(integer({ min: -1700, max: 1700 }), { maxLength: 80 }),
      (positions) => {
        const pins = positions.map((x, index) => pin(String(index), x / 10));
        const groups = clusterMapPins(pins, 3600);
        expect(
          groups
            .flatMap((group) => group.pins)
            .map((pin) => pin.id)
            .sort(),
        ).toEqual(pins.map((pin) => pin.id).sort());
        for (let i = 0; i < groups.length; i++) {
          for (const other of groups.slice(i + 1)) {
            const delta = Math.abs(groups[i]!.lng - other.lng);
            expect(Math.min(delta, 360 - delta) * 10).toBeGreaterThanOrEqual(
              56 - 1e-8,
            );
          }
        }
      },
    ),
  );
});
