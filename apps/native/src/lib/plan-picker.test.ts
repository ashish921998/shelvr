import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/home/plan-city-sheet", () => ({
  PlanCitySheet: vi.fn(() => null),
}));
vi.mock("@/lib/city-plan", () => ({ useCityPlan: () => ({}) }));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => ({}) }));
vi.mock("@/lib/access", () => ({ canBrowse: () => true }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));

const { planTarget } = await import("./plan-picker");

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
