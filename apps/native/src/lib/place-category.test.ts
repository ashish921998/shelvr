import { describe, expect, it, vi } from "vitest";
import { placeCategoryLabel } from "./place-category";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => `[${key}]` }));

describe("placeCategoryLabel", () => {
  it("labels a category Apple Maps gave", () => {
    expect(placeCategoryLabel("Cafe")).toBe("☕ [placeCategory.cafe]");
  });

  it("labels nothing without a known category", () => {
    expect(placeCategoryLabel(undefined)).toBeUndefined();
    expect(placeCategoryLabel("Laundry")).toBeUndefined();
    expect(placeCategoryLabel("toString")).toBeUndefined();
  });
});
