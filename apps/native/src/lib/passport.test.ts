// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  passportCounts,
  type Stamp,
  stampDate,
  usePassport,
  useStamping,
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
