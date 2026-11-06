import { describe, expect, it, vi } from "vitest";
import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { BEEN_CITY_IDS, BEEN_CITY_POINTS } from "@convex/model/beenCities";
import { distanceKm } from "@convex/model/trip";
import { SAMPLE_CITIES, SAMPLE_CITY_IDS } from "./sample-cities";
import { applyBeenChange, beenFrame, beenMarkers } from "./been-cities";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => `t(${key})` }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("expo-router", () => ({ useRouter: vi.fn() }));

const LISBON = BEEN_CITY_POINTS.lisbon;
const KM_PER_DEGREE = (6371 * Math.PI) / 180;
const north = (km: number) => ({
  lat: LISBON.lat + km / KM_PER_DEGREE,
  lng: LISBON.lng,
});
const corners = (id: keyof typeof BEEN_CITY_POINTS) => [
  {
    lat: BEEN_CITY_POINTS[id].lat - 0.2,
    lng: BEEN_CITY_POINTS[id].lng - 0.2,
  },
  {
    lat: BEEN_CITY_POINTS[id].lat + 0.2,
    lng: BEEN_CITY_POINTS[id].lng + 0.2,
  },
];

describe("the Been city list", () => {
  it("is the sample city list, each with a photo and a name", () => {
    expect([...BEEN_CITY_IDS].sort()).toEqual([...SAMPLE_CITY_IDS].sort());
    for (const id of SAMPLE_CITY_IDS) {
      expect(CITY_PICTURES[id]?.view, id).toBeDefined();
      expect(SAMPLE_CITIES[id].name, id).toMatch(/^tripTeaser\.city/);
    }
  });
});

describe("applyBeenChange", () => {
  it("adds and removes, de-duplicated and sorted", () => {
    expect(applyBeenChange(["madrid"], { add: ["lisbon", "lisbon"] })).toEqual([
      "lisbon",
      "madrid",
    ]);
    expect(
      applyBeenChange(["lisbon", "madrid"], { remove: ["lisbon", "tokyo"] }),
    ).toEqual(["madrid"]);
    expect(applyBeenChange(["tokyo", "austin"], {})).toEqual([
      "austin",
      "tokyo",
    ]);
  });

  it("lets a remove win over an add of the same city", () => {
    expect(
      applyBeenChange(["madrid"], { add: ["lisbon"], remove: ["lisbon"] }),
    ).toEqual(["madrid"]);
  });
});

describe("beenMarkers", () => {
  it("hides a city with a saved place within 50 km and keeps one without", () => {
    expect(distanceKm(LISBON, north(10))).toBeCloseTo(10, 3);
    expect(distanceKm(LISBON, north(51))).toBeCloseTo(51, 3);
    expect(beenMarkers(["lisbon"], [north(10)])).toEqual([]);
    expect(beenMarkers(["lisbon", "madrid"], [north(51)])).toEqual([
      {
        id: "been:lisbon",
        name: "t(tripTeaser.cityLisbon)",
        lat: LISBON.lat,
        lng: LISBON.lng,
        been: true,
      },
      {
        id: "been:madrid",
        name: "t(tripTeaser.cityMadrid)",
        lat: BEEN_CITY_POINTS.madrid.lat,
        lng: BEEN_CITY_POINTS.madrid.lng,
        been: true,
      },
    ]);
  });
});

describe("beenFrame", () => {
  it("frames nothing without cities", () => {
    expect(beenFrame([])).toEqual([]);
  });

  it("pads a lone city so the map does not open at street level", () => {
    expect(beenFrame(["lisbon"])).toEqual(corners("lisbon"));
  });

  it("frames the largest group and leaves a far city out", () => {
    expect(beenFrame(["tokyo", "madrid", "lisbon"])).toEqual([
      ...corners("lisbon"),
      ...corners("madrid"),
    ]);
  });

  it("frames the first city by id when lone cities tie", () => {
    expect(beenFrame(["tokyo", "austin"])).toEqual(corners("austin"));
  });
});
