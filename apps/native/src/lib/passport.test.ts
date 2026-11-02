// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  CARD_PLACES,
  filterByWent,
  passportCities,
  passportCounts,
  shareCardOf,
  type Stamp,
  stampDate,
  unstampedCities,
  usePassport,
  useStamping,
  wentInCity,
} from "./passport";

const mocks = vi.hoisted(() => ({
  setVisited: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  alert: vi.fn(),
  query: vi.fn((): { data?: unknown } => ({})),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => mocks.setVisited,
}));
vi.mock("@convex/_generated/api", () => ({
  api: { placeVisits: { getPassport: {}, setVisited: {} } },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/haptics", () => ({
  haptics: { impact: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query() }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));

afterEach(() => {
  mocks.setVisited.mockReset();
  mocks.capture.mockReset();
  mocks.alert.mockReset();
});

const ITEM = "item1" as Id<"items">;

function stamp(over: Partial<Stamp> = {}): Stamp {
  return {
    key: "tigre",
    name: "Tigre",
    itemId: ITEM,
    visitedAt: 5,
    cover: null,
    ...over,
  };
}

describe("passportCounts", () => {
  it("counts cities by name and hides countries until one is known", () => {
    expect(
      passportCounts([
        stamp({ city: "Lisbon" }),
        stamp({ key: "b", city: "lisbon " }),
        stamp({ key: "c" }),
      ]),
    ).toEqual({ places: 3, cities: 1, countries: null });
    expect(
      passportCounts([
        stamp({ city: "Lisbon", countryCode: "PT" }),
        stamp({ key: "b", city: "Paris", countryCode: "FR" }),
        stamp({ key: "c", city: "Porto", countryCode: "PT" }),
      ]),
    ).toEqual({ places: 3, cities: 3, countries: 2 });
  });

  it("gives a place from before Shelvr no date", () => {
    expect(stampDate(stamp({ backfilled: true }))).toBeNull();
    expect(stampDate(stamp())).toBe(5);
  });
});

describe("grouping by city", () => {
  it("groups stamps by city name and puts places with no city last", () => {
    const groups = passportCities([
      stamp({ key: "a", city: undefined }),
      stamp({ key: "b", city: "Lisbon" }),
      stamp({ key: "c", city: "lisbon " }),
      stamp({ key: "d", city: "Porto" }),
    ]);
    expect(groups.map((group) => [group.city, group.stamps.length])).toEqual([
      ["Lisbon", 2],
      ["Porto", 1],
      [null, 1],
    ]);
  });

  it("groups places to stamp by city in the order they come", () => {
    const place = { itemId: ITEM, cover: null };
    const groups = unstampedCities([
      { ...place, name: "Tigre", city: "Lisbon" },
      { ...place, name: "Majestic", city: "Porto" },
      { ...place, name: "Dante", city: "LISBON" },
    ]);
    expect(groups.map((group) => [group.city, group.places.length])).toEqual([
      ["Lisbon", 2],
      ["Porto", 1],
    ]);
  });

  it("counts the places someone went to in one city", () => {
    const stamps = [
      stamp({ key: "a", city: "Lisbon" }),
      stamp({ key: "b", city: " lisbon" }),
      stamp({ key: "c", city: "Porto" }),
    ];
    expect(wentInCity(stamps, "Lisbon")).toBe(2);
    expect(wentInCity(undefined, "Lisbon")).toBe(0);
  });
});

describe("filterByWent", () => {
  const places = [{ name: "Tigre" }, { name: "Dante" }];
  const went = (name: string) => name === "Tigre";

  it("keeps every place, the ones to go to, or the ones visited", () => {
    expect(filterByWent(places, "all", went)).toEqual(places);
    expect(filterByWent(places, "want", went)).toEqual([{ name: "Dante" }]);
    expect(filterByWent(places, "went", went)).toEqual([{ name: "Tigre" }]);
  });
});

describe("shareCardOf", () => {
  it("numbers the city's places and pins only the located ones", () => {
    const card = shareCardOf(
      [
        stamp({ key: "a", name: "Tigre", city: "Lisbon", lat: 1, lng: 2 }),
        stamp({ key: "b", name: "Majestic", city: "Porto", lat: 3, lng: 4 }),
        stamp({ key: "c", name: "Dante", city: "lisbon", visitedAt: 9 }),
      ],
      "Lisbon",
    );
    expect(card).toEqual({
      total: 2,
      month: 5,
      savedOn: "elsewhere",
      places: [
        { number: 1, name: "Tigre", lat: 1, lng: 2 },
        { number: 2, name: "Dante" },
      ],
    });
  });

  it("names the app the city's places were saved from", () => {
    const savedOn = (...sources: Stamp["source"][]) =>
      shareCardOf(
        sources.map((source, index) =>
          stamp({ key: String(index), city: "Lisbon", source }),
        ),
        "Lisbon",
      ).savedOn;
    expect(savedOn("instagram", undefined)).toBe("instagram");
    expect(savedOn("tiktok")).toBe("tiktok");
    expect(savedOn("tiktok", "instagram")).toBe("both");
    expect(savedOn(undefined)).toBe("elsewhere");
  });

  it("has no month when every place was stamped as from before", () => {
    const card = shareCardOf(
      [stamp({ city: "Lisbon", backfilled: true })],
      "Lisbon",
    );
    expect(card.month).toBeNull();
  });

  it("lists at most a card's worth of places but counts them all", () => {
    const stamps = Array.from({ length: CARD_PLACES + 3 }, (_, index) =>
      stamp({ key: String(index), name: `P${index}`, city: "Lisbon" }),
    );
    const card = shareCardOf(stamps, "Lisbon");
    expect(card.total).toBe(CARD_PLACES + 3);
    expect(card.places).toHaveLength(CARD_PLACES);
  });
});

describe("usePassport", () => {
  it("finds a stamp by the place's name however it is written", () => {
    mocks.query.mockReturnValue({ data: [stamp({ key: "caffedante" })] });
    const { result } = renderHook(() => usePassport());
    expect(result.current.stampFor("Caffé  Dante")?.key).toBe("caffedante");
    expect(result.current.stampFor("Tigre")).toBeUndefined();
  });
});

describe("useStamping", () => {
  const place = { itemId: ITEM, name: "Tigre", city: "Lisbon", cover: null };

  it("opens a fresh stamp once the mark is saved, and undo takes it back", async () => {
    mocks.setVisited.mockResolvedValue(null);
    const { result } = renderHook(() => useStamping("city"));
    await act(() => result.current.stamp(place));
    expect(mocks.setVisited).toHaveBeenCalledWith({
      itemId: ITEM,
      name: "Tigre",
      visited: true,
    });
    expect(result.current.open).toMatchObject({ name: "Tigre", fresh: true });
    expect(mocks.capture).toHaveBeenCalledWith("place_stamped", {
      surface: "city",
    });

    await act(() => result.current.remove());
    expect(mocks.setVisited).toHaveBeenLastCalledWith({
      itemId: ITEM,
      name: "Tigre",
      visited: false,
    });
    expect(result.current.open).toBeNull();
  });

  it("opens nothing and says so when the mark fails", async () => {
    mocks.setVisited.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useStamping("city"));
    await act(() => result.current.stamp(place));
    expect(result.current.open).toBeNull();
    expect(mocks.alert).toHaveBeenCalled();
  });
});
