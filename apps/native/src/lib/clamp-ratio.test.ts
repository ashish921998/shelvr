import { describe, expect, it } from "vitest";
import { clampRatio } from "./clamp-ratio";

describe("clampRatio", () => {
  it("uses the fallback for missing and invalid ratios", () => {
    expect(clampRatio(undefined, 1.2)).toBe(1.2);
    expect(clampRatio(Number.NaN, 1.2)).toBe(1.2);
    expect(clampRatio(0, 1.2)).toBe(1.2);
  });

  it("bounds ratios using the default limits", () => {
    expect(clampRatio(0.2, 1)).toBe(0.5);
    expect(clampRatio(3, 1)).toBe(2);
  });

  it("supports surface-specific limits", () => {
    expect(clampRatio(0.5, 1, { min: 0.6, max: 1.9 })).toBe(0.6);
    expect(clampRatio(2, 1, { min: 0.6, max: 1.9 })).toBe(1.9);
  });
});
