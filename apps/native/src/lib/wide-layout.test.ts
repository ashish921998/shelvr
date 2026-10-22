import { describe, expect, it, vi } from "vitest";
import { feedColumns, tripSidePanel } from "./wide-layout";

vi.mock("react-native", () => ({ useWindowDimensions: vi.fn() }));

describe("feedColumns", () => {
  it("keeps two columns on every iPhone in portrait", () => {
    for (const width of [320, 375, 393, 402, 440]) {
      expect(feedColumns(width)).toBe(2);
    }
  });

  it("adds columns on an unfolded iPhone Duo", () => {
    expect(feedColumns(669)).toBe(3);
    expect(feedColumns(951)).toBe(4);
  });
});

describe("tripSidePanel", () => {
  it("keeps the bottom panel on phones and tall screens", () => {
    expect(tripSidePanel(440, 956)).toBe(false);
    expect(tripSidePanel(669, 951)).toBe(false);
  });

  it("moves the panel to the side on a wide, short screen", () => {
    expect(tripSidePanel(951, 669)).toBe(true);
  });
});
