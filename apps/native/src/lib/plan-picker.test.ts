// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listed: { data: undefined, isError: false } as {
    data?: { city: string; count: number; cover: null }[];
    isError: boolean;
  },
  start: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("@/components/home/plan-city-sheet", () => ({
  PlanCitySheet: vi.fn(() => null),
}));
vi.mock("@/lib/city-plan", () => ({
  useCityPlan: () => ({ busy: null, start: mocks.start }),
}));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => ({}) }));
vi.mock("@/lib/access", () => ({ canBrowse: () => true }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.listed }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));

const { planTarget, usePlanPicker } = await import("./plan-picker");

const city = (name: string) => ({ city: name, count: 3, cover: null });

describe("planTarget", () => {
  it("plans for the city on screen when the user can plan there", () => {
    expect(planTarget([city("Lisbon"), city("Porto")], "lisbon")).toEqual({
      city: "Lisbon",
    });
  });

  it("asks which city when the one on screen has nothing to plan", () => {
    expect(planTarget([city("Lisbon"), city("Porto")], "Madrid")).toBe("pick");
    expect(planTarget([city("Lisbon"), city("Porto")], undefined)).toBe("pick");
  });

  it("skips the question when there is only one city", () => {
    expect(planTarget([city("Lisbon")], undefined)).toEqual({ city: "Lisbon" });
    expect(planTarget([city("Lisbon")], "Madrid")).toEqual({ city: "Lisbon" });
  });

  it("has nothing to plan without cities", () => {
    expect(planTarget([], "Lisbon")).toBe("none");
  });
});

describe("usePlanPicker", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    mocks.alert.mockReset();
  });

  it("says the cities failed to load instead of dropping the tap", () => {
    mocks.listed = { data: undefined, isError: true };
    const { result } = renderHook(() => usePlanPicker());
    result.current.plan("date", "Lisbon");
    expect(mocks.alert).toHaveBeenCalledTimes(1);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("plans for the city on screen once the cities are loaded", () => {
    mocks.listed = { data: [city("Lisbon"), city("Porto")], isError: false };
    const { result } = renderHook(() => usePlanPicker());
    result.current.plan("date", "Lisbon");
    expect(mocks.start).toHaveBeenCalledWith("date", "Lisbon", undefined);
    expect(mocks.alert).not.toHaveBeenCalled();
  });
});
