import { describe, expect, it } from "vitest";

import { isLens, LENS_SLUGS, LENSES } from "./lenses";

describe("lens registry", () => {
  it("recognizes exactly the four lenses", () => {
    expect(LENS_SLUGS).toEqual(["era", "roast", "taste", "find"]);
    for (const slug of LENS_SLUGS) expect(isLens(slug)).toBe(true);
    for (const value of ["", "ERA", "toString", "__proto__", 1, undefined]) {
      expect(isLens(value)).toBe(false);
    }
  });

  it.each(LENS_SLUGS)("gives %s a valid image range and copy", (slug) => {
    const lens = LENSES[slug];

    expect(lens.slug).toBe(slug);
    expect(lens.minImages).toBeGreaterThanOrEqual(1);
    expect(lens.minImages).toBeLessThanOrEqual(lens.maxImages);
    for (const copy of [
      lens.name,
      lens.hook,
      lens.blurb,
      lens.waitingLine,
      lens.installBridge,
      lens.shareVerb,
    ]) {
      expect(copy.trim()).not.toBe("");
    }
  });
});
