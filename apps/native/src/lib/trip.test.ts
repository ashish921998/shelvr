import { describe, expect, it, vi } from "vitest";

import {
  canPlanTrip,
  dayColor,
  directionsUrl,
  fitCamera,
  locatedStops,
  pickedStop,
  toDateKey,
  tripDayDate,
  type TripStopView,
} from "./trip";

const platform = vi.hoisted(() => ({ OS: "ios" }));
vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("convex/react", () => ({ useAction: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

function stop(fields: Partial<TripStopView> = {}): TripStopView {
  return {
    itemId: "item" as TripStopView["itemId"],
    name: "Pastéis de Belém",
    why: "The tarts",
    slot: "morning",
    ...fields,
  };
}

describe("canPlanTrip", () => {
  it("needs three ready saves that name a city", () => {
    const save = { status: "ready", cities: ["Lisbon"] };
    expect(canPlanTrip([save, save])).toBe(false);
    expect(
      canPlanTrip([save, save, { status: "processing", cities: ["Lisbon"] }]),
    ).toBe(false);
    expect(canPlanTrip([save, save, { status: "ready", cities: [] }])).toBe(
      false,
    );
    expect(canPlanTrip([save, save, save])).toBe(true);
  });
});

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

describe("locatedStops", () => {
  it("keeps only placed stops, with their place in the day", () => {
    const located = locatedStops([
      stop({ lat: 38.69, lng: -9.2 }),
      stop(),
      stop({ lat: 38.71, lng: -9.13 }),
    ]);
    expect(located.map((s) => s.index)).toEqual([0, 2]);
    expect(located[1].coordinates).toEqual({
      latitude: 38.71,
      longitude: -9.13,
    });
  });
});

describe("fitCamera", () => {
  const view = { width: 400, height: 860, top: 100, bottom: 450 };

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

  it("keeps every point inside the map left above the panel", () => {
    const points = [
      { latitude: 38.6916, longitude: -9.216 },
      { latitude: 38.6979, longitude: -9.2068 },
      { latitude: 38.7121, longitude: -9.1394 },
    ];
    const camera = fitCamera(points, view)!;
    // Project each point to screen points the way the map does.
    const lngPerPoint = 360 / (view.width * 2 ** camera.zoom);
    const cos = Math.cos((camera.coordinates.latitude * Math.PI) / 180);
    for (const point of points) {
      const x =
        view.width / 2 +
        (point.longitude - camera.coordinates.longitude) / lngPerPoint;
      const y =
        view.height / 2 -
        (point.latitude - camera.coordinates.latitude) / (lngPerPoint * cos);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(view.width);
      expect(y).toBeGreaterThan(view.top);
      expect(y).toBeLessThan(view.height - view.bottom);
    }
  });
});

describe("pickedStop", () => {
  it("follows a stop that moved and loses one that left", () => {
    const pick = {
      day: 0,
      itemId: "b" as TripStopView["itemId"],
      name: "Park",
    };
    const moved = stop({ itemId: pick.itemId, name: pick.name });
    const day = [
      stop({ itemId: "a" as TripStopView["itemId"] }),
      stop({ itemId: "c" as TripStopView["itemId"], name: "Taberna" }),
      moved,
    ];
    expect(pickedStop([{ stops: day }], pick)).toEqual({
      ref: { day: 0, stop: 2 },
      view: moved,
    });
    expect(pickedStop([{ stops: day.slice(0, 2) }], pick)).toBeNull();
    expect(pickedStop(undefined, pick)).toBeNull();
    expect(pickedStop([{ stops: day }], null)).toBeNull();
  });
});

describe("directionsUrl", () => {
  it("walks to the pin in Apple Maps on iOS", () => {
    platform.OS = "ios";
    expect(directionsUrl(stop({ lat: 38.69, lng: -9.2 }), "Lisbon")).toBe(
      "https://maps.apple.com/?daddr=38.69%2C-9.2&q=Past%C3%A9is%20de%20Bel%C3%A9m&dirflg=w",
    );
  });

  it("searches by name and city without a pin, in Google Maps on Android", () => {
    platform.OS = "android";
    expect(directionsUrl(stop({ area: "Belém" }), "Lisbon")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Past%C3%A9is%20de%20Bel%C3%A9m%2C%20Bel%C3%A9m%2C%20Lisbon&travelmode=walking",
    );
  });
});

describe("dayColor", () => {
  it("gives each day of a five-day trip its own color", () => {
    expect(new Set([0, 1, 2, 3, 4].map(dayColor)).size).toBe(5);
    expect(dayColor(5)).toBe(dayColor(0));
  });
});
