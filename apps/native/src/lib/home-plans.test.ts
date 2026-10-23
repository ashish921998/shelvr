import { describe, expect, it, vi } from "vitest";

import {
  cityProgress,
  daysUntil,
  goalSpaceIds,
  greetingKey,
  spotRows,
  weekStrip,
} from "./home-plans";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("convex/react", () => ({ useAction: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

const id = (value: string) => value as never;

describe("goalSpaceIds", () => {
  it("matches the onboarding names ignoring case and spacing", () => {
    expect(
      goalSpaceIds([
        { _id: id("a"), name: "  date NIGHTS " },
        { _id: id("b"), name: "travel" },
        { _id: id("c"), name: "Recipes" },
      ]),
    ).toEqual({ date: "a", travel: "b" });
  });

  it("takes the first match in list order", () => {
    expect(
      goalSpaceIds([
        { _id: id("a"), name: "Travel" },
        { _id: id("b"), name: "Travel" },
      ]).travel,
    ).toBe("a");
  });

  it("leaves a goal without a space undefined", () => {
    expect(goalSpaceIds([{ _id: id("a"), name: "Travel plans" }])).toEqual({
      date: undefined,
      travel: undefined,
    });
  });
});

describe("weekStrip", () => {
  it.each([
    ["Monday", new Date(2026, 9, 19)],
    ["Thursday", new Date(2026, 9, 22)],
    ["Friday", new Date(2026, 9, 23)],
    ["Saturday", new Date(2026, 9, 24)],
    ["Sunday", new Date(2026, 9, 25)],
  ])("highlights exactly Friday on a %s", (_name, now) => {
    const strip = weekStrip(now, "en");
    expect(strip.map((day) => day.label)).toEqual([
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
      "S",
    ]);
    expect(strip.flatMap((day, i) => (day.highlighted ? [i] : []))).toEqual([
      4,
    ]);
  });

  it("follows the locale", () => {
    expect(weekStrip(new Date(2026, 9, 23), "de")[0]?.label).toBe("M");
    expect(weekStrip(new Date(2026, 9, 23), "ja")[0]?.label).toBe("月");
  });
});

describe("cityProgress", () => {
  const rows = (count: number) => cityProgress([{ city: "Lisbon", count }], 3);

  it("is not ready one save short", () => {
    expect(rows(2)).toEqual([
      { city: "Lisbon", count: 2, ready: false, remaining: 1, fraction: 2 / 3 },
    ]);
  });

  it("is ready at the minimum", () => {
    expect(rows(3)[0]).toMatchObject({
      ready: true,
      remaining: 0,
      fraction: 1,
    });
  });

  it("caps the bar past the minimum", () => {
    expect(rows(4)[0]).toMatchObject({
      ready: true,
      remaining: 0,
      fraction: 1,
    });
  });

  it("sorts by count, largest first", () => {
    expect(
      cityProgress(
        [
          { city: "Porto", count: 1 },
          { city: "Lisbon", count: 5 },
        ],
        3,
      ).map((row) => row.city),
    ).toEqual(["Lisbon", "Porto"]);
  });
});

describe("daysUntil", () => {
  const now = new Date(2026, 9, 23, 22, 30);

  it("counts calendar days ahead", () => {
    expect(daysUntil("2026-10-24", now)).toBe(1);
    expect(daysUntil("2026-11-02", now)).toBe(10);
  });

  it("is zero on the start date", () => {
    expect(daysUntil("2026-10-23", now)).toBe(0);
  });

  it("is null for past, missing or malformed dates", () => {
    expect(daysUntil("2026-10-22", now)).toBeNull();
    expect(daysUntil(undefined, now)).toBeNull();
    expect(daysUntil("soon", now)).toBeNull();
  });
});

describe("greetingKey", () => {
  it.each([
    [0, "homePlans.greetingMorning"],
    [11, "homePlans.greetingMorning"],
    [12, "homePlans.greetingAfternoon"],
    [17, "homePlans.greetingAfternoon"],
    [18, "homePlans.greetingEvening"],
    [23, "homePlans.greetingEvening"],
  ] as const)("hour %i is %s", (hour, key) => {
    expect(greetingKey(hour)).toBe(key);
  });
});

describe("spotRows", () => {
  it("puts ready saves first, newest first, up to the limit", () => {
    const items = [
      { status: "processing", _creationTime: 9 },
      { status: "ready", _creationTime: 1 },
      { status: "ready", _creationTime: 5 },
      { status: "ready", _creationTime: 3 },
    ];
    expect(spotRows(items, 3).map((i) => i._creationTime)).toEqual([5, 3, 1]);
  });
});
