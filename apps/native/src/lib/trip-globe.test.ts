import { geoContains, geoDistance, geoOrthographic } from "d3-geo";
import type { Feature, MultiPolygon } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land from "../../assets/world/land-110m.json";
import { describe, expect, it } from "vitest";
import {
  GLOBE_DIVE_MS,
  closeUp,
  countryLight,
  globeCamera,
  globePaths,
  globePin,
  globeRegion,
  globeSettled,
  thinLand,
  tripCenter,
} from "./trip-globe";
import { REVEAL_TIMING } from "./trip-reveal";

const SCREEN = { width: 393, height: 852 };
const LISBON = { lng: -9.139, lat: 38.722 };
const TOKYO = { lng: 139.7, lat: 35.7 };
const DEG = 180 / Math.PI;
const TOKYO_FAR_SIDE_AT = 18515;

const project = (
  camera: ReturnType<typeof globeCamera>,
  point: { lng: number; lat: number },
) =>
  geoOrthographic()
    .rotate(camera.rotate)
    .scale(camera.scale)
    .translate([camera.x, camera.y])([point.lng, point.lat]);

describe("the spin the dive tests start from", () => {
  it("has Tokyo on the far side of the globe", () => {
    const { rotate } = globeCamera({
      t: TOKYO_FAR_SIDE_AT,
      diveAt: null,
      ...SCREEN,
      target: null,
    });
    const facing: [number, number] = [-rotate[0], -rotate[1]];
    expect(geoDistance(facing, [TOKYO.lng, TOKYO.lat])).toBeGreaterThan(
      Math.PI / 2,
    );
  });
});

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
    const diveAt = TOKYO_FAR_SIDE_AT;
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

describe("thinLand", () => {
  const outline = feature(
    land as unknown as Topology,
    (land as unknown as Topology).objects.land as GeometryCollection,
  );
  const points = (shape: Feature) =>
    (shape.geometry as MultiPolygon).coordinates.flat(2).length;
  const fullPoints = outline.features
    .map((shape) =>
      shape.geometry.type === "Polygon"
        ? shape.geometry.coordinates.flat().length
        : (shape.geometry as MultiPolygon).coordinates.flat(2).length,
    )
    .reduce((sum, count) => sum + count, 0);

  it("keeps every island while drawing the world from about half the points", () => {
    const thin = thinLand(outline, 1.5);
    const islands = outline.features.flatMap((shape) =>
      shape.geometry.type === "Polygon"
        ? [shape.geometry.coordinates]
        : (shape.geometry as MultiPolygon).coordinates,
    );
    expect((thin.geometry as MultiPolygon).coordinates).toHaveLength(
      islands.length,
    );
    expect(points(thin)).toBeLessThan(fullPoints * 0.6);
    const corsica = { lng: 9.1, lat: 42.1 };
    expect(
      (thin.geometry as MultiPolygon).coordinates.some((polygon) =>
        geoContains({ type: "Polygon", coordinates: polygon }, [
          corsica.lng,
          corsica.lat,
        ]),
      ),
    ).toBe(true);
  });

  it("keeps a ring too small to thin as it is", () => {
    const speck = [
      [5, 5],
      [5.1, 5],
      [5, 5.1],
      [5, 5],
    ];
    const thin = thinLand(
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [speck] },
          },
        ],
      },
      1,
    );
    expect(thin.geometry).toEqual({
      type: "MultiPolygon",
      coordinates: [[speck]],
    });
  });

  it("spins on the thinned land and dives on the full outline", () => {
    const spinning = globeCamera({
      t: 5000,
      diveAt: null,
      ...SCREEN,
      target: LISBON,
    });
    const diving = globeCamera({
      t: 5001,
      diveAt: 5000,
      ...SCREEN,
      target: LISBON,
    });
    const commands = (camera: ReturnType<typeof globeCamera>) =>
      (globePaths(camera, SCREEN, null).land.match(/L/g) ?? []).length;
    expect(diving.dive).toBeGreaterThan(0);
    expect(commands(spinning)).toBeLessThan(commands(diving) * 0.7);
  });
});

describe("globePin", () => {
  it("follows the target onto the landing point", () => {
    const at = (t: number) =>
      globePin(
        globeCamera({ t, diveAt: 5000, ...SCREEN, target: LISBON }),
        LISBON,
      );
    const landed = at(5000 + GLOBE_DIVE_MS);
    expect(landed?.x).toBeCloseTo(SCREEN.width / 2);
    expect(landed?.y).toBeCloseTo(SCREEN.height / 2);
  });

  it("holds the target on the globe's edge while it is on the far side", () => {
    const camera = globeCamera({
      t: TOKYO_FAR_SIDE_AT,
      diveAt: null,
      ...SCREEN,
      target: null,
    });
    const edge = globePin(camera, { lng: 139.7, lat: 35.7 });
    expect(Math.hypot(edge.x - camera.x, edge.y - camera.y)).toBeCloseTo(
      camera.scale,
    );
  });

  it("moves without a jump as the target comes round", () => {
    let last = globePin(
      globeCamera({
        t: TOKYO_FAR_SIDE_AT,
        diveAt: TOKYO_FAR_SIDE_AT,
        ...SCREEN,
        target: TOKYO,
      }),
      TOKYO,
    );
    for (let step = 1; step <= 200; step++) {
      const t = TOKYO_FAR_SIDE_AT + (GLOBE_DIVE_MS * step) / 200;
      const next = globePin(
        globeCamera({ t, diveAt: TOKYO_FAR_SIDE_AT, ...SCREEN, target: TOKYO }),
        TOKYO,
      );
      expect(Math.hypot(next.x - last.x, next.y - last.y)).toBeLessThan(60);
      last = next;
    }
  });
});
