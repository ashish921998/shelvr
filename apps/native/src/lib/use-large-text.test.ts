// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LARGE_TEXT_SCALE, useLargeText } from "./use-large-text";

const dimensions = vi.hoisted(() => ({ fontScale: 1 }));

vi.mock("react-native", () => ({ useWindowDimensions: () => dimensions }));

function largeAt(fontScale: number) {
  dimensions.fontScale = fontScale;
  return renderHook(() => useLargeText()).result.current;
}

describe("useLargeText", () => {
  it("is off at the default and the threshold itself", () => {
    expect(largeAt(1)).toBe(false);
    expect(largeAt(LARGE_TEXT_SCALE)).toBe(false);
  });

  it("is on past the threshold", () => {
    expect(largeAt(1.6)).toBe(true);
  });
});
