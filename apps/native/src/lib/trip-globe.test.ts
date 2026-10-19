import { geoDistance, geoOrthographic } from "d3-geo";
import { describe, expect, it } from "vitest";
import {
  GLOBE_DIVE_MS,
  closeUp,
  countryLight,
  globeCamera,
  globePaths,
  globeRegion,
  globeSettled,
  tripCenter,
} from "./trip-globe";
import { REVEAL_TIMING } from "./trip-reveal";

const SCREEN = { width: 393, height: 852 };
const LISBON = { lng: -9.139, lat: 38.722 };
const DEG = 180 / Math.PI;

const project = (
  camera: ReturnType<typeof globeCamera>,
  point: { lng: number; lat: number },
) =>
  geoOrthographic()
    .rotate(camera.rotate)
    .scale(camera.scale)
    .translate([camera.x, camera.y])([point.lng, point.lat]);

describe("tripCenter", () => {
  it("takes the median of the pinned stops", () => {
    const center = tripCenter([
      {
        stops: [{ lat: 38.7, lng: -9.1 }, { lat: 38.71, lng: -9.2 }, {}],
      },
      { stops: [{ lat: 38.8, lng: -9.15 }] },
      { stops: [{ lat: 37.1, lng: -8.6 }] },
    ]);
    expect(center?.lat).toBeCloseTo(38.705);
    expect(center?.lng).toBeCloseTo(-9.125);
  });

  it("stays on a trip that crosses the antimeridian", () => {
    const center = tripCenter([
      {
        stops: [
          { lat: -18.1, lng: 178.4 },
          { lat: -17.5, lng: -178.8 },
        ],
      },
    ]);
    expect(center?.lng).toBeCloseTo(179.8);
  });

  it("is null when no stop has a pin", () => {
    expect(tripCenter([{ stops: [{}, {}] }])).toBeNull();
    expect(tripCenter()).toBeNull();
  });
});

describe("globeCamera", () => {
  const camera = (t: number, diveAt: number | null, target = LISBON) =>
    globeCamera({ t, diveAt, ...SCREEN, target });

  it("waits below the screen, then rises with the dots", () => {
    const hidden = camera(0, null);
    expect(hidden.y - hidden.scale).toBeGreaterThan(SCREEN.height);
    expect(globePaths(hidden, SCREEN, null).land).toBe("");
    const risen = camera(REVEAL_TIMING.dots + 2000, null);
    expect(risen.y - risen.scale).toBeLessThan(SCREEN.height);
    expect(globePaths(risen, SCREEN, null).land).not.toBe("");
  });

  it("keeps spinning while the trip is built", () => {
    expect(camera(3000, null).rotate[0]).not.toBe(camera(4000, null).rotate[0]);
  });

  it("lands the target on the screen's centre", () => {
    const landed = camera(5000 + GLOBE_DIVE_MS, 5000);
    const [x, y] = project(landed, LISBON) ?? [];
    expect(x).toBeCloseTo(SCREEN.width / 2);
    expect(y).toBeCloseTo(SCREEN.height / 2);
    expect(landed.dive).toBe(1);
    expect(globeSettled(5000 + GLOBE_DIVE_MS, 5000)).toBe(true);
    expect(globeSettled(5000 + GLOBE_DIVE_MS - 1, 5000)).toBe(false);
  });

  it("turns the short way round, whatever the spin reached", () => {
    for (const diveAt of [2700, 9000, 20000]) {
      const start = camera(diveAt, diveAt).rotate[0];
      const end = camera(diveAt + GLOBE_DIVE_MS, diveAt).rotate[0];
      expect(Math.abs(end - start)).toBeLessThanOrEqual(180);
    }
  });

  it("with no pins, dives into whatever faces the screen", () => {
    const start = globeCamera({
      t: 5000,
      diveAt: 5000,
      ...SCREEN,
      target: null,
    });
    const end = globeCamera({
      t: 5000 + GLOBE_DIVE_MS,
      diveAt: 5000,
      ...SCREEN,
      target: null,
    });
    expect(end.rotate).toEqual(start.rotate);
    expect(end.y).toBeCloseTo(SCREEN.height / 2);
  });
});

describe("globeRegion", () => {
  it("finds the country the target is in, and its neighbours", () => {
    const region = globeRegion(LISBON);
    expect(region.country?.id).toBe("620");
    const ids = region.nearby.features.map((country) => country.id);
    expect(ids).toEqual(expect.arrayContaining(["620", "724", "504"]));
    expect(ids).not.toContain("392");
  });

  it("reaches across the antimeridian", () => {
    const ids = globeRegion({ lng: 178.4, lat: -18.1 }).nearby.features.map(
      (country) => country.id,
    );
    // Fiji spans it; Samoa sits on the other side.
    expect(ids).toEqual(expect.arrayContaining(["242", "882"]));
  });

  it("finds no country out at sea", () => {
    expect(globeRegion({ lng: -30, lat: 30 }).country).toBeNull();
  });
});

describe("closeUp", () => {
  it("keeps the whole world's land until the close-up fills the screen", () => {
    const tokyo = { lng: 139.7, lat: 35.7 };
    const region = globeRegion(tokyo);
    // The spin has the far side of the globe facing the screen.
    const diveAt = 18515;
    let closed = false;
    for (let t = diveAt; t <= diveAt + GLOBE_DIVE_MS; t += 25) {
      const camera = globeCamera({ t, diveAt, ...SCREEN, target: tokyo });
      if (!closeUp(camera, SCREEN, region)) continue;
      closed = true;
      const projection = geoOrthographic()
        .rotate(camera.rotate)
        .scale(camera.scale)
        .translate([camera.x, camera.y]);
      for (const corner of [
        [0, 0],
        [SCREEN.width, 0],
        [0, SCREEN.height],
        [SCREEN.width, SCREEN.height],
      ] as [number, number][]) {
        const point = projection.invert?.(corner);
        expect(point).toBeDefined();
        expect(geoDistance(point!, [tokyo.lng, tokyo.lat]) * DEG).toBeLessThan(
          25,
        );
      }
    }
    expect(closed).toBe(true);
  });
});

describe("globePaths", () => {
  it("lights the country as the dive closes in", () => {
    const region = globeRegion(LISBON);
    const early = globeCamera({
      t: 5300,
      diveAt: 5000,
      ...SCREEN,
      target: LISBON,
    });
    const landed = globeCamera({
      t: 5000 + GLOBE_DIVE_MS,
      diveAt: 5000,
      ...SCREEN,
      target: LISBON,
    });
    expect(countryLight(early.dive)).toBe(0);
    expect(globePaths(early, SCREEN, region).country).toBe("");
    expect(countryLight(landed.dive)).toBe(1);
    expect(globePaths(landed, SCREEN, region).country).toMatch(/^M/);
  });
});
