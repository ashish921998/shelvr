import { describe, expect, it } from "vitest";
import { isDarkColor, withAlpha } from "./color";

describe("colour helpers", () => {
  it("converts a hex theme colour to rgba", () => {
    expect(withAlpha("#e6a23c", 0.25)).toBe("rgba(230, 162, 60, 0.25)");
    expect(withAlpha("not-a-colour", 0.5)).toBe("not-a-colour");
  });

  it("tells the light and dark app backgrounds apart", () => {
    expect(isDarkColor("#faf6ee")).toBe(false);
    expect(isDarkColor("#191510")).toBe(true);
    expect(isDarkColor("#111417")).toBe(true);
  });
});
