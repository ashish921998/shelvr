import { describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  PLAN_SHARE_URL,
  placeLabel,
  planShareText,
  spinSteps,
  type PlanPlace,
} from "./make-plan";

vi.mock("convex/react", () => ({ useAction: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

function place(name: string, area?: string): PlanPlace {
  return {
    name,
    ...(area ? { area } : {}),
    why: `Why ${name}`,
    itemId: "item" as Id<"items">,
  };
}

describe("placeLabel", () => {
  it("adds the area when there is one", () => {
    expect(placeLabel(place("Balthazar", "SoHo"))).toBe("Balthazar, SoHo");
    expect(placeLabel(place("Bar Lola"))).toBe("Bar Lola");
  });
});

describe("planShareText", () => {
  it("lists every place in order, the pick, and the link", () => {
    const places = [place("Balthazar", "SoHo"), place("Bar Lola")];
    const text = planShareText("Date night", places, places[1]);

    expect(text).toBe(
      [
        "Our shortlist from Date night:",
        "",
        "1. Balthazar, SoHo: Why Balthazar",
        "2. Bar Lola: Why Bar Lola",
        "",
        "Tonight: Bar Lola",
        "",
        `Made with Shelvr ${PLAN_SHARE_URL}`,
      ].join("\n"),
    );
  });

  it("leaves the pick out until there is one", () => {
    expect(
      planShareText("Date night", [place("Balthazar")], null),
    ).not.toContain("Tonight");
  });
});

describe("spinSteps", () => {
  it("laps the list, ends on the winner and slows down", () => {
    const steps = spinSteps(5, 3);

    expect(steps).toHaveLength(5 * 2 + 4);
    expect(steps.at(-1)?.index).toBe(3);
    expect(steps.every((step) => step.index >= 0 && step.index < 5)).toBe(true);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].holdMs).toBeGreaterThanOrEqual(steps[i - 1].holdMs);
    }
  });

  it("is empty with nothing to pick", () => {
    expect(spinSteps(0, 0)).toEqual([]);
  });
});
