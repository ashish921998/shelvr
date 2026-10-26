import { describe, expect, it, vi } from "vitest";
import { tripSidePanel } from "./wide-layout";

vi.mock("react-native", () => ({ useWindowDimensions: vi.fn() }));

describe("tripSidePanel", () => {
  it("keeps the bottom panel on phones and tall screens", () => {
    expect(tripSidePanel(440, 956)).toBe(false);
    expect(tripSidePanel(669, 951)).toBe(false);
  });

  it("moves the panel to the side on a wide, short screen", () => {
    expect(tripSidePanel(951, 669)).toBe(true);
  });
});
