import { describe, expect, it } from "vitest";

import { cityProgress, isVisited, progressLine } from "@/lib/city-progress";

describe("city progress", () => {
  const visited = new Set(["caffedante", "blend"]);

  it("matches a place by its key, ignoring case and accents", () => {
    expect(isVisited("Caffé Dante", visited)).toBe(true);
    expect(isVisited("BLEND", visited)).toBe(true);
    expect(isVisited("Micho", visited)).toBe(false);
  });

  it("counts the visited places among a city's pins", () => {
    expect(
      cityProgress(
        [{ name: "Caffé Dante" }, { name: "Micho" }, { name: "Blend" }],
        visited,
      ),
    ).toEqual({ visited: 2, total: 3 });
  });

  it("writes a line only once something is visited", () => {
    expect(progressLine({ visited: 0, total: 5 })).toBeNull();
    expect(progressLine({ visited: 0, total: 0 })).toBeNull();
    expect(progressLine({ visited: 1, total: 1 })).toBe("1 of 1 place visited");
    expect(progressLine({ visited: 9, total: 4 })).toBe(
      "4 of 4 places visited",
    );
  });
});
