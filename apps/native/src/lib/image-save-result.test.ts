import type { Id } from "@convex/_generated/dataModel";
import { describe, expect, it } from "vitest";
import { onlyResult } from "./image-save-result";

const saved = {
  status: "saved" as const,
  operationId: "image:1",
  image: { uri: "file:///1.jpg" },
  itemId: "item-1" as Id<"items">,
};

describe("onlyResult", () => {
  it("returns the one result of a one-image save", () => {
    expect(onlyResult([saved])).toBe(saved);
  });

  it("throws a fixed code when the save returned no result", () => {
    expect(() => onlyResult([])).toThrow("image_save_result_missing");
  });
});
