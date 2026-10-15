import { describe, expect, it } from "vitest";
import { isEmptySpace } from "./empty-space";

describe("isEmptySpace", () => {
  it("is empty only with no saves and no suggestions", () => {
    expect(isEmptySpace({ itemCount: 0, suggestionCount: 0 })).toBe(true);
    expect(isEmptySpace({ itemCount: 1, suggestionCount: 0 })).toBe(false);
    expect(isEmptySpace({ itemCount: 0, suggestionCount: 2 })).toBe(false);
  });
});
