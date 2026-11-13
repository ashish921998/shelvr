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
    const place = { itemId: ITEM, cover: null, spot: { lat: 1, lng: 2 } };
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
  const went = (place: { name: string }) => place.name === "Tigre";

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

describe("useStamping", () => {
  const open = {
    itemId: ITEM,
    name: "Tigre",
    city: "Lisbon",
    cover: null,
    at: null,
    spot: { lat: 1, lng: 2 },
  };

  it("takes back the mark at the stamp's own spot, and closes it", async () => {
    mocks.setVisited.mockResolvedValue(null);
    const { result } = renderHook(() => useStamping());
    act(() => result.current.show(open));
    await act(() => result.current.remove());
    expect(mocks.setVisited).toHaveBeenCalledWith({
      itemId: ITEM,
      name: "Tigre",
      visited: false,
      spot: { lat: 1, lng: 2 },
    });
    expect(mocks.capture).toHaveBeenCalledWith("place_unstamped", {
      surface: "passport",
    });
    expect(result.current.open).toBeNull();
  });

  it("takes back a stamp with no spot by its name alone", async () => {
    mocks.setVisited.mockResolvedValue(null);
    const { result } = renderHook(() => useStamping());
    const { spot: _spot, ...named } = open;
    act(() => result.current.show(named));
    await act(() => result.current.remove());
    expect(mocks.setVisited).toHaveBeenCalledWith({
      itemId: ITEM,
      name: "Tigre",
      visited: false,
    });
  });

  it("keeps the stamp open and says so when taking it back fails", async () => {
    mocks.setVisited.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useStamping());
    act(() => result.current.show(open));
    await act(() => result.current.remove());
    expect(result.current.open).toMatchObject({ name: "Tigre" });
    expect(mocks.alert).toHaveBeenCalled();
    expect(mocks.captureError).toHaveBeenLastCalledWith(
      "place_unstamp_failed",
      expect.any(Error),
    );
  });

  it("sends one request for a double tap", async () => {
    let finish = () => {};
    mocks.setVisited.mockImplementation(
      () => new Promise<null>((resolve) => (finish = () => resolve(null))),
    );
    const { result } = renderHook(() => useStamping());
    act(() => result.current.show(open));
    await act(async () => {
      const first = result.current.remove();
      void result.current.remove();
      finish();
      await first;
    });
    expect(mocks.setVisited).toHaveBeenCalledTimes(1);
  });

  it("keeps another stamp open when an earlier removal finishes", async () => {
    let finish = () => {};
    mocks.setVisited.mockImplementation(
      () => new Promise<null>((resolve) => (finish = () => resolve(null))),
    );
    const other = { ...open, name: "Ramiro", spot: { lat: 3, lng: 4 } };
    const { result } = renderHook(() => useStamping());
    act(() => result.current.show(open));
    let removing: Promise<void> = Promise.resolve();
    act(() => {
      removing = result.current.remove();
    });
    act(() => result.current.show(other));
    await act(async () => {
      finish();
      await removing;
    });
    expect(result.current.open).toEqual(other);
  });
});
