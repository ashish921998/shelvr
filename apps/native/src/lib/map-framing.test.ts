import { describe, expect, it } from "vitest";

import { anchorsKnown, anchorsOf, nextFraming } from "./map-framing";

describe("nextFraming", () => {
  const first = { key: "all", places: ["a"], opened: true };

  it("holds the framing while the places in view change", () => {
    expect(nextFraming(first, ["a", "b"], "all")).toBe(first);
    expect(nextFraming(first, [], "all")).toBe(first);
  });

  it("takes a new framing when the filter changes, even an empty one", () => {
    expect(nextFraming(first, ["c"], "coffee")).toEqual({
      key: "coffee",
      places: ["c"],
      opened: true,
    });
    expect(nextFraming(first, [], "coffee")).toEqual({
      key: "coffee",
      places: [],
      opened: true,
    });
  });

  it("takes the first framing once there are places to frame", () => {
    const empty = { key: "all", places: [], opened: false };
    expect(nextFraming(empty, [], "all")).toBe(empty);
    expect(nextFraming(empty, ["a"], "all")).toEqual({
      key: "all",
      places: ["a"],
      opened: true,
    });
  });

  it("keeps an empty framing after the map opened, whatever Discover sends", () => {
    const coffee = nextFraming(first, ["cafe"], "coffee");
    const all = nextFraming(coffee, [], "all");
    expect(all).toEqual({ key: "all", places: [], opened: true });
    expect(nextFraming(all, ["distant cafe"], "all")).toBe(all);
  });
});

describe("anchorsOf", () => {
  const own = { source: "own" as const, lat: 1, lng: 1 };
  const other = { source: "discover" as const, lat: 2, lng: 2 };

  it("anchors on the person's own places, else on what is shown", () => {
    expect(anchorsOf([other, own])).toEqual([own]);
    expect(anchorsOf([other])).toEqual([other]);
    expect(anchorsOf([])).toEqual([]);
  });
});

describe("anchorsKnown", () => {
  const own = { source: "own" as const, lat: 1, lng: 1 };
  const other = { source: "discover" as const, lat: 2, lng: 2 };

  it("trusts the person's own places at once", () => {
    expect(anchorsKnown([own], false)).toBe(true);
  });

  it("waits for the area's answer before judging by Discover places", () => {
    expect(anchorsKnown([other], false)).toBe(false);
    expect(anchorsKnown([], false)).toBe(false);
    expect(anchorsKnown([other], true)).toBe(true);
    expect(anchorsKnown([], true)).toBe(true);
  });
});
