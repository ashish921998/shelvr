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

  const alongEquator = (longitudes: number[]) =>
    longitudes.map((longitude) => ({ latitude: 0, longitude }));

  it.each([
    ["Fiji, centred east", [177.44, -178.8, 179.33], 179.32],
    ["the Aleutians, centred west", [-166.54, 173.18, -176.64], -176.68],
    ["both names of the line", [180, -180], 180],
    ["a pair centred on the line", [179, -179], 180],
    ["the Pacific, more than a hemisphere apart", [-118.24, 139.69], -169.275],
  ])("takes the short way round for %s", (_, longitudes, centre) => {
    const camera = fitCamera(alongEquator(longitudes), view)!;
    const awayFromTheLine = fitCamera(
      alongEquator(longitudes.map((lng) => ((lng + 360) % 360) - 180)),
      view,
    )!;
    expect(camera.coordinates.longitude).toBeCloseTo(centre);
    expect(Math.abs(camera.coordinates.longitude)).toBeLessThanOrEqual(180);
    expect(camera.zoom).toBeCloseTo(awayFromTheLine.zoom);
  });

  it.each([
    ["one place", [178.4419]],
    ["places up against the line", [179.991, 177.4434]],
    ["places either side of Greenwich", [2.3522, -0.1276, -9.1393]],
    ["a tie between both ways round", [180, 0]],
    ["places all round the globe", [120, -120, 0]],
  ])("keeps the plain middle for %s", (_, longitudes) => {
    expect(
      fitCamera(alongEquator(longitudes), view)!.coordinates.longitude,
    ).toBe((Math.min(...longitudes) + Math.max(...longitudes)) / 2);
  });
});
