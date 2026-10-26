import { expect, it } from "vitest";
import { findSample } from "./onboarding-demo";

it("recognises a sample post an older build queued, by its link", () => {
  expect(
    findSample("https://www.bbcgoodfood.com/recipes/classic-lasagne")?.kind,
  ).toBe("Recipes");
  expect(findSample("https://example.com/my-own")).toBeUndefined();
});
