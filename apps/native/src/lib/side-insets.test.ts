import { describe, expect, it } from "vitest";
import {
  centeredSheetInsets,
  contentWidth,
  sideOffsets,
  sidePadding,
} from "./side-insets";

const DUO = { left: 0, right: 84 };

describe("sidePadding", () => {
  it("adds nothing on a portrait iPhone", () => {
    expect(sidePadding({ left: 0, right: 0 }, 16)).toEqual({
      paddingLeft: 16,
      paddingRight: 16,
    });
  });

  it("keeps content clear of the Duo's right-edge strip", () => {
    expect(sidePadding(DUO, 16)).toEqual({
      paddingLeft: 16,
      paddingRight: 100,
    });
    expect(sidePadding(DUO)).toEqual({ paddingLeft: 0, paddingRight: 84 });
  });
});

describe("sideOffsets", () => {
  it("places an absolute view between the side insets", () => {
    expect(sideOffsets(DUO)).toEqual({ left: 0, right: 84 });
    expect(sideOffsets({ left: 4, right: 84 }, 12)).toEqual({
      left: 16,
      right: 96,
    });
  });
});

describe("contentWidth", () => {
  it("is the window width on a portrait iPhone", () => {
    expect(contentWidth(402, { left: 0, right: 0 })).toBe(402);
  });

  it("leaves out the Duo's right-edge strip", () => {
    expect(contentWidth(951, DUO)).toBe(867);
  });

  it("never goes below zero", () => {
    expect(contentWidth(40, { left: 30, right: 30 })).toBe(0);
  });
});

describe("centeredSheetInsets", () => {
  it("keeps a full-width sheet clear of the Duo's right-edge strip", () => {
    expect(centeredSheetInsets(466, 466, DUO)).toEqual(DUO);
  });

  it("adds nothing for a centered card that ends before the strip", () => {
    expect(centeredSheetInsets(540, 951, DUO)).toEqual({ left: 0, right: 0 });
  });

  it("covers only the part of the strip a wide card reaches", () => {
    expect(centeredSheetInsets(851, 951, DUO)).toEqual({ left: 0, right: 34 });
  });

  it("adds nothing on a portrait iPhone", () => {
    expect(centeredSheetInsets(402, 402, { left: 0, right: 0 })).toEqual({
      left: 0,
      right: 0,
    });
  });

  it("treats a sheet a fraction wider than the window as full width", () => {
    expect(centeredSheetInsets(466.5, 466, DUO)).toEqual(DUO);
  });
});
