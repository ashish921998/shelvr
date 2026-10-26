import { describe, expect, it } from "vitest";
import { isPresetSpace } from "./save-kinds";

describe("isPresetSpace", () => {
  it.each([
    ["Watch later", true],
    ["Read later", true],
    ["Home & decor", true],
    ["Date nights", true],
    ["Products", false],
    ["Book club", false],
    ["recipes", false],
  ])("%s -> %s", (name, expected) => {
    expect(isPresetSpace(name)).toBe(expected);
  });
});
