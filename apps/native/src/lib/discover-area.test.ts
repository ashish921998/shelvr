import { describe, expect, it } from "vitest";

import { appleZoom } from "./city-pins";
import { sameBox, visibleBox, WORLD_BOX } from "./discover-area";
import { fitCamera } from "./trip";

const WIDTH = 400;
const HEIGHT = 860;
const view = {
  width: WIDTH,
  height: HEIGHT,
  top: 120,
  bottom: 90,
  worldWidth: 256,
  centerY: HEIGHT / 2,
};

const LISBON = { latitude: 38.72, longitude: -9.14 };

const contains = (
  box: NonNullable<ReturnType<typeof visibleBox>>,
  p: { latitude: number; longitude: number },
) =>
  p.longitude >= box.west &&
  p.longitude <= box.east &&
  p.latitude >= box.south &&
  p.latitude <= box.north;

describe("visibleBox", () => {
  it("contains the camera centre", () => {
    for (const zoom of [3, 6.4, 10, 13.7, 16]) {
      const box = visibleBox(
        { ...LISBON, zoom },
        { width: WIDTH, height: HEIGHT, apple: false },
      )!;
      expect(contains(box, LISBON)).toBe(true);
    }
  });

  it("holds every point fitCamera framed, on Android and on iOS", () => {
    const points = [
      { latitude: 38.7, longitude: -9.2 },
      { latitude: 38.76, longitude: -9.1 },
      { latitude: 38.73, longitude: -9.13 },
    ];
    const camera = fitCamera(points, view)!;
    const android = visibleBox(
      { ...camera.coordinates, zoom: camera.zoom },
      { width: WIDTH, height: HEIGHT, apple: false },
    )!;
    const ios = visibleBox(
      {
        ...camera.coordinates,
        zoom: appleZoom(
          camera.zoom,
          camera.coordinates.latitude,
          WIDTH,
          HEIGHT,
        ),
      },
      { width: WIDTH, height: HEIGHT, apple: true },
    )!;
    for (const point of points) {
      expect(contains(android, point)).toBe(true);
      expect(contains(ios, point)).toBe(true);
    }
    expect(ios).toEqual(android);
  });

  it("gives the same box for a small pan and a new one for a big pan", () => {
    const screen = { width: WIDTH, height: HEIGHT, apple: false };
    const box = visibleBox({ ...LISBON, zoom: 13 }, screen);
    const nudged = visibleBox(
      {
        latitude: LISBON.latitude + 0.0004,
        longitude: LISBON.longitude - 0.0004,
        zoom: 13.02,
      },
      screen,
    );
    expect(sameBox(nudged, box)).toBe(true);
    const far = visibleBox(
      {
        latitude: LISBON.latitude,
        longitude: LISBON.longitude + 0.3,
        zoom: 13,
      },
      screen,
    );
    expect(sameBox(far, box)).toBe(false);
  });

  it("snaps to the same grid for a box that zooms in", () => {
    const screen = { width: WIDTH, height: HEIGHT, apple: false };
    const wide = visibleBox({ ...LISBON, zoom: 9 }, screen)!;
    const tight = visibleBox({ ...LISBON, zoom: 14 }, screen)!;
    expect(tight.east - tight.west).toBeLessThan(wide.east - wide.west);
    expect(tight.west).toBeGreaterThanOrEqual(wide.west);
    expect(tight.east).toBeLessThanOrEqual(wide.east);
  });

  it("sends the world box for a view half the world wide", () => {
    const screen = { width: WIDTH, height: HEIGHT, apple: false };
    expect(visibleBox({ latitude: 0, longitude: 0, zoom: 0 }, screen)).toEqual(
      WORLD_BOX,
    );
    expect(
      visibleBox({ latitude: 20, longitude: 100, zoom: 2 }, screen),
    ).toEqual(WORLD_BOX);
    const poles = visibleBox({ latitude: 89, longitude: 10, zoom: 4 }, screen)!;
    expect(poles.north).toBe(85);
  });

  it("keeps both sides of the antimeridian", () => {
    const box = visibleBox(
      { latitude: -16.8, longitude: 179.95, zoom: 11 },
      { width: WIDTH, height: HEIGHT, apple: false },
    )!;
    expect(box.east).toBeGreaterThan(180);
    expect(contains(box, { latitude: -16.8, longitude: -179.98 + 360 })).toBe(
      true,
    );
  });

  it("covers the span a rotated or tilted map reports", () => {
    const screen = { width: WIDTH, height: HEIGHT, apple: false };
    const centre = { latitude: 38.72, longitude: -9.125, zoom: 13 };
    const edge = { latitude: 38.72, longitude: -9.195 };
    expect(contains(visibleBox(centre, screen)!, edge)).toBe(false);
    const rotated = visibleBox(
      { ...centre, latitudeDelta: 0.07, longitudeDelta: 0.1476 },
      screen,
    )!;
    expect(contains(rotated, edge)).toBe(true);
    const horizon = { latitude: 38.72 + 0.2, longitude: -9.125 };
    const flat = { ...centre, latitudeDelta: 0.25, longitudeDelta: 0.07 };
    expect(contains(visibleBox(flat, screen)!, horizon)).toBe(false);
    expect(contains(visibleBox({ ...flat, tilt: 45 }, screen)!, horizon)).toBe(
      true,
    );
  });

  it("gives no box for a camera it cannot read", () => {
    const screen = { width: WIDTH, height: HEIGHT, apple: true };
    expect(
      visibleBox({ latitude: Number.NaN, longitude: 0, zoom: 5 }, screen),
    ).toBeUndefined();
    expect(
      visibleBox({ ...LISBON, zoom: 5 }, { ...screen, width: 0 }),
    ).toBeUndefined();
  });
});

describe("sameBox", () => {
  it("compares every edge and tolerates a missing box", () => {
    expect(sameBox(WORLD_BOX, { ...WORLD_BOX })).toBe(true);
    expect(sameBox(WORLD_BOX, { ...WORLD_BOX, north: 80 })).toBe(false);
    expect(sameBox(undefined, undefined)).toBe(true);
    expect(sameBox(WORLD_BOX, undefined)).toBe(false);
  });
});
