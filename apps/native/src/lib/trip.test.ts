import { describe, expect, it } from "vitest";

import { fitCamera, toDateKey, tripDayDate } from "./trip";

describe("trip dates", () => {
  it("keeps the picked calendar day", () => {
    expect(toDateKey(new Date(2026, 10, 3, 23, 30))).toBe("2026-11-03");
  });

  it("counts days from the start, across a month end", () => {
    expect(tripDayDate("2026-10-31", 1)).toEqual(new Date(2026, 10, 1));
    expect(tripDayDate(undefined, 1)).toBeNull();
    expect(tripDayDate("not a date", 0)).toBeNull();
  });
});

describe("fitCamera", () => {
  const view = {
    width: 400,
    height: 860,
    top: 100,
    bottom: 450,
    worldWidth: 400,
    centerY: 100 + (860 - 100 - 34) / 2,
  };

  it("is undefined with nothing to show", () => {
    expect(fitCamera([], view)).toBeUndefined();
  });

  it("keeps the pins clear of the Duo's right-edge strip", () => {
    const duo = {
      width: 951,
      height: 678,
      top: 60,
      bottom: 40,
      right: 84,
      worldWidth: 951,
      centerY: 678 / 2,
    };
    const points = [
      { latitude: 30.2701, longitude: -97.7312 },
      { latitude: 30.2638, longitude: -97.7713 },
      { latitude: 30.2849, longitude: -97.7341 },
    ];
    const camera = fitCamera(points, duo)!;
    expect(camera.zoom).toBeLessThan(
      fitCamera(points, { ...duo, right: 0 })!.zoom,
    );
    const lngPerPoint = 360 / (duo.worldWidth * 2 ** camera.zoom);
    const xs = points.map(
      (point) =>
        duo.width / 2 +
        (point.longitude - camera.coordinates.longitude) / lngPerPoint,
    );
    for (const x of xs) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(duo.width - duo.right);
    }
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(
      (duo.width - duo.right) / 2,
      0,
    );
  });

  it("centers on the whole view when no side is covered", () => {
    const points = [
      { latitude: 30.2701, longitude: -97.7312 },
      { latitude: 30.2638, longitude: -97.7713 },
    ];
    expect(fitCamera(points, { ...view, left: 0, right: 0 })).toEqual(
      fitCamera(points, view),
    );
  });

  it("zooms out further for a wider day", () => {
    const tight = fitCamera(
      [
        { latitude: 38.71, longitude: -9.13 },
        { latitude: 38.712, longitude: -9.135 },
      ],
      view,
    );
    const wide = fitCamera(
      [
        { latitude: 38.69, longitude: -9.21 },
        { latitude: 38.72, longitude: -9.13 },
      ],
      view,
    );
    expect(tight?.zoom).toBeGreaterThan(wide?.zoom ?? Infinity);
    expect(wide?.coordinates.longitude).toBeCloseTo(-9.17);
  });

  it.each([
    ["Apple Maps", view],
    ["Google Maps", { ...view, worldWidth: 256, centerY: view.height / 2 }],
  ])("keeps every point inside the visible map on %s", (_, map) => {
    const points = [
      { latitude: 38.6916, longitude: -9.216 },
      { latitude: 38.6979, longitude: -9.2068 },
      { latitude: 38.7121, longitude: -9.1394 },
    ];
    const camera = fitCamera(points, map)!;
    const lngPerPoint = 360 / (map.worldWidth * 2 ** camera.zoom);
    const cos = Math.cos((camera.coordinates.latitude * Math.PI) / 180);
    const ys: number[] = [];
    for (const point of points) {
      const x =
        view.width / 2 +
        (point.longitude - camera.coordinates.longitude) / lngPerPoint;
      const y =
        map.centerY -
        (point.latitude - camera.coordinates.latitude) / (lngPerPoint * cos);
      ys.push(y);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(view.width);
      expect(y).toBeGreaterThan(view.top);
      expect(y).toBeLessThan(view.height - view.bottom);
    }
    const visible = view.height - view.top - view.bottom;
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(
      view.top + visible / 2,
      0,
    );
  });
});
