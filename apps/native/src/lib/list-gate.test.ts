import { describe, expect, it } from "vitest";
import { listRouteAllowed, personalPlanAllowed } from "./list-gate";

describe("listRouteAllowed", () => {
  it("never opens a list route before onboarding", () => {
    expect(
      listRouteAllowed({ onboarded: false, gated: false, lists: [] }),
    ).toBe(false);
  });

  it("opens every route for a Pro account", () => {
    expect(listRouteAllowed({ onboarded: true, gated: false, lists: [] })).toBe(
      true,
    );
  });

  it("opens the routes for a free member of a list", () => {
    expect(
      listRouteAllowed({ onboarded: true, gated: true, lists: [{}] }),
    ).toBe(true);
  });

  it("bounces a free account with no list", () => {
    expect(listRouteAllowed({ onboarded: true, gated: true, lists: [] })).toBe(
      false,
    );
  });

  it("does not bounce a free member while the membership query loads", () => {
    expect(
      listRouteAllowed({ onboarded: true, gated: true, lists: undefined }),
    ).toBe(true);
  });
});

describe("personalPlanAllowed", () => {
  it("lets a gated caller plan only from a list", () => {
    expect(personalPlanAllowed(true, undefined)).toBe(false);
    expect(personalPlanAllowed(true, "list1")).toBe(true);
    expect(personalPlanAllowed(false, undefined)).toBe(true);
  });
});
