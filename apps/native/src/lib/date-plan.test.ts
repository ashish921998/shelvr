import { describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import type { DatePlanResult, DateStop } from "@convex/model/datePlan";

import {
  dateShareText,
  DATE_OPTIONS,
  directionsUrl,
  emptyMessage,
  canChange,
  infoAction,
  slotLabel,
  walkMinutes,
} from "./date-plan";

const platform = vi.hoisted(() => ({ OS: "ios" }));
vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("convex/react", () => ({ useAction: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("expo-router", () => ({ useRouter: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ openPaywall: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

const dinner: DateStop = {
  slot: "first",
  source: "save",
  itemId: "item1" as Id<"items">,
  name: "Ramen Shop",
  lat: 38.711,
  lng: -9.142,
  appleId: "A1",
};
const bar: DateStop = {
  slot: "second",
  source: "suggested",
  name: "Red Frog",
  lat: 38.715,
  lng: -9.142,
};

function result(fields: Partial<DatePlanResult> = {}): DatePlanResult {
  return {
    status: "ready",
    city: "Lisbon",
    kind: "classic",
    stops: [dinner, bar],
    evenings: [{ first: 0, second: 1 }],
    ...fields,
  };
}

describe("DATE_OPTIONS", () => {
  it("asks for the two kinds the planner makes, then surprise, then the two on the way", () => {
    expect(DATE_OPTIONS.map((o) => [o.ask, o.soon === true])).toEqual([
      ["classic", false],
      ["lowkey", false],
      ["surprise", false],
      ["new", true],
      ["big", true],
    ]);
  });
});

describe("walkMinutes", () => {
  it("allows for winding streets and never says zero", () => {
    // About 445 m as the crow flies.
    expect(walkMinutes(dinner, bar)).toBe(7);
    expect(walkMinutes(dinner, dinner)).toBe(1);
  });
});

describe("slotLabel", () => {
  it("names each stop by what it is for on that kind of date", () => {
    expect(slotLabel("classic", "first")).toBe("Dinner");
    expect(slotLabel("classic", "second")).toBe("Drinks or dessert");
    expect(slotLabel("lowkey", "first")).toBe("Coffee");
    expect(slotLabel("lowkey", "second")).toBe("A walk");
  });
});

describe("infoAction", () => {
  it("opens Apple's place card first, then the save, then Maps", () => {
    expect(infoAction(dinner, true)).toEqual({ kind: "card", appleId: "A1" });
    expect(infoAction(dinner, false)).toEqual({
      kind: "save",
      itemId: "item1",
    });
    expect(infoAction(bar, true)).toEqual({
      kind: "maps",
      url: "https://maps.apple.com/?ll=38.715,-9.142&q=Red%20Frog",
    });
  });
});

describe("directionsUrl", () => {
  it("asks Maps for directions to the first stop", () => {
    platform.OS = "ios";
    expect(directionsUrl(dinner)).toBe(
      "https://maps.apple.com/?daddr=38.711,-9.142&q=Ramen%20Shop",
    );
    platform.OS = "android";
    expect(directionsUrl(dinner)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=38.711%2C-9.142",
    );
    platform.OS = "ios";
  });
});

describe("dateShareText", () => {
  it("lists both stops with a Maps link each", () => {
    expect(dateShareText("Lisbon", dinner, bar)).toBe(
      [
        "Date night in Lisbon? Here's the plan:",
        "",
        "1. Ramen Shop",
        "https://maps.apple.com/?ll=38.711,-9.142&q=Ramen%20Shop",
        "",
        "2. Red Frog",
        "https://maps.apple.com/?ll=38.715,-9.142&q=Red%20Frog",
      ].join("\n"),
    );
  });
});

describe("canChange", () => {
  it("offers a change only when another stop nearby still pairs with the kept one", () => {
    const evening = { first: 0, second: 1 };
    expect(canChange(result(), evening, "first")).toBe(false);
    expect(canChange(result(), evening, "second")).toBe(false);
    const sushi: DateStop = { ...dinner, name: "Sushi Bar", lng: -9.141 };
    const more = result({ stops: [dinner, bar, sushi] });
    expect(canChange(more, evening, "first")).toBe(true);
    expect(canChange(more, evening, "second")).toBe(false);
  });
});

describe("emptyMessage", () => {
  it("says what to save for the kind asked, or that the saves are far apart", () => {
    expect(
      emptyMessage(result({ status: "no_anchor", kind: "lowkey" })).message,
    ).toBe("Save a café or a park in Lisbon, then plan again.");
    expect(emptyMessage(result({ status: "no_anchor" })).message).toBe(
      "Save a restaurant or a bar in Lisbon, then plan again.",
    );
    expect(emptyMessage(result({ status: "no_pair" })).title).toBe(
      "Your spots are far apart",
    );
  });
});
