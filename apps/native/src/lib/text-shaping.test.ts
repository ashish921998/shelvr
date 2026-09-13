import { describe, expect, it } from "vitest";
import { needsNativeText } from "./text-shaping";

describe("native text shaping", () => {
  it.each(["العربية", "עברית", "தமிழ்", "हिन्दी", "日本語", "e\u0301", "👩‍👩‍👧‍👦"])(
    "preserves shaping and font fallback for %s",
    (text) => expect(needsNativeText(text)).toBe(true),
  );
  it("keeps the existing morph for plain Latin titles", () => {
    expect(needsNativeText("shelvr")).toBe(false);
    expect(needsNativeText("Save it — don’t forget…")).toBe(false);
    expect(needsNativeText("Café")).toBe(false);
  });
});
