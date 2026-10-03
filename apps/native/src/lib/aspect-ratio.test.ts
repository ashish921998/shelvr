import { describe, expect, it } from "vitest";
import { clampRatio } from "./aspect-ratio";

describe("clampRatio", () => {
  it("uses the fallback for missing and invalid ratios", () => {
    expect(clampRatio(undefined, 1.2, 0.5, 2)).toBe(1.2);
    expect(clampRatio(Number.NaN, 1.2, 0.5, 2)).toBe(1.2);
    expect(clampRatio(0, 1.2, 0.5, 2)).toBe(1.2);
  });

  it("bounds ratios to the given limits", () => {
    expect(clampRatio(0.2, 1, 0.5, 2)).toBe(0.5);
    expect(clampRatio(3, 1, 0.5, 2)).toBe(2);
  });

  it("preserves ratios within the limits", () => {
    expect(clampRatio(1.4, 1, 0.6, 1.9)).toBe(1.4);
  });
});
