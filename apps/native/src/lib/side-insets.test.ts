import { describe, expect, it } from "vitest";
import { sideOffsets, sidePadding } from "./side-insets";

describe("sidePadding", () => {
  it("adds nothing on a portrait iPhone", () => {
    expect(sidePadding({ left: 0, right: 0 }, 16)).toEqual({
      paddingLeft: 16,
      paddingRight: 16,
    });
  });

  it("keeps content clear of the Duo's right-edge strip", () => {
    expect(sidePadding({ left: 0, right: 62 }, 16)).toEqual({
      paddingLeft: 16,
      paddingRight: 78,
    });
    expect(sidePadding({ left: 0, right: 62 })).toEqual({
      paddingLeft: 0,
      paddingRight: 62,
    });
  });
});

describe("sideOffsets", () => {
  it("places an absolute view between the side insets", () => {
    expect(sideOffsets({ left: 0, right: 62 })).toEqual({ left: 0, right: 62 });
    expect(sideOffsets({ left: 4, right: 62 }, 12)).toEqual({
      left: 16,
      right: 74,
    });
  });
});
