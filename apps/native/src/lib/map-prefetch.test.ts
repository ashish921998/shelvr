// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapPlacesWanted } from "./map-prefetch";

const mocks = vi.hoisted(() => ({
  items: undefined as unknown[] | undefined,
  entitled: true,
  cities: { data: undefined as unknown, isError: false },
  args: [] as unknown[],
}));

vi.mock("@/lib/home-feed", () => ({
  useHomeFeed: () => ({ items: mocks.items }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({ entitled: mocks.entitled }),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { listCities: "listCities" } },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_query: unknown, args: unknown) => {
    mocks.args.push(args);
    return {};
  },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.cities }));

beforeEach(() => {
  mocks.items = undefined;
  mocks.entitled = true;
  mocks.cities = { data: undefined, isError: false };
  mocks.args = [];
});

describe("useMapPlacesWanted", () => {
  it("waits while Home is still loading and the tab is closed", () => {
    const { result } = renderHook(() => useMapPlacesWanted(false));
    expect(result.current).toBe(false);
  });

  it("waits for Home's cities as well as its feed", () => {
    mocks.items = [];
    const { result } = renderHook(() => useMapPlacesWanted(false));
    expect(result.current).toBe(false);
  });

  it("starts once Home's feed and cities have loaded", () => {
    mocks.items = [];
    mocks.cities = { data: [], isError: false };
    const { result } = renderHook(() => useMapPlacesWanted(false));
    expect(result.current).toBe(true);
  });

  it("does not wait on cities Home never asks for without Pro", () => {
    mocks.items = [];
    mocks.entitled = false;
    const { result } = renderHook(() => useMapPlacesWanted(false));
    expect(result.current).toBe(true);
    expect(mocks.args).toContain("skip");
  });

  it("does not wait forever when Home's cities fail", () => {
    mocks.items = [];
    mocks.cities = { data: undefined, isError: true };
    const { result } = renderHook(() => useMapPlacesWanted(false));
    expect(result.current).toBe(true);
  });

  it("starts at once when the tab is opened first", () => {
    const { result } = renderHook(() => useMapPlacesWanted(true));
    expect(result.current).toBe(true);
  });

  it("stays on once started, even if Home's data goes away", () => {
    mocks.items = [];
    mocks.cities = { data: [], isError: false };
    const { result, rerender } = renderHook(() => useMapPlacesWanted(false));
    mocks.items = undefined;
    mocks.cities = { data: undefined, isError: false };
    rerender();
    expect(result.current).toBe(true);
  });

  it("asks for Home's cities with Home's own arguments", () => {
    renderHook(() => useMapPlacesWanted(false));
    expect(mocks.args[0]).toEqual({});
  });
});
