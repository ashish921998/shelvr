import { describe, expect, it } from "vitest";

import { anchorsOf, nextFraming } from "./map-framing";

describe("nextFraming", () => {
  const first = { key: "all", places: ["a"] };

  it("holds the framing while the places in view change", () => {
    expect(nextFraming(first, ["a", "b"], "all")).toBe(first);
    expect(nextFraming(first, [], "all")).toBe(first);
  });

  it("takes a new framing when the filter changes, even an empty one", () => {
    expect(nextFraming(first, ["c"], "coffee")).toEqual({
      key: "coffee",
      places: ["c"],
    });
    expect(nextFraming(first, [], "coffee")).toEqual({
      key: "coffee",
      places: [],
    });
  });

  it("takes the first framing once there are places to frame", () => {
    const empty = { key: "all", places: [] };
    expect(nextFraming(empty, [], "all")).toBe(empty);
    expect(nextFraming(empty, ["a"], "all")).toEqual({
      key: "all",
      places: ["a"],
    });
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
