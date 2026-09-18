import { describe, expect, it } from "vitest";
import { iconStrokes, iconStrokeWidth, type InkIconName } from "./icons";

/** Every name the app passes to the drawn set. Kept explicit so deleting a
 * case from the switch fails here rather than shipping a crossed box. */
const NAMES: InkIconName[] = [
  "square.grid.2x2",
  "square.grid.2x2.fill",
  "rectangle.stack",
  "rectangle.stack.fill",
  "photo.stack",
  "photo.on.rectangle.angled",
  "map",
  "magnifyingglass",
  "plus",
  "xmark",
  "checkmark",
  "chevron.left",
  "chevron.right",
  "chevron.down",
  "arrow.up",
  "arrow.up.right",
  "ellipsis",
  "trash",
  "arrow.uturn.backward",
  "arrow.clockwise",
  "arrow.2.circlepath",
  "person.fill",
  "person",
  "square.and.arrow.up",
  "tray.and.arrow.up",
  "calendar",
  "safari",
  "gearshape",
  "gearshape.fill",
  "sparkles",
  "star.fill",
  "heart",
  "camera",
  "link",
  "doc.on.doc",
  "doc.text",
  "bag",
  "envelope",
  "message",
  "phone",
  "house.fill",
  "play.fill",
  "play.rectangle",
  "info.circle",
  "exclamationmark.circle",
  "checkmark.circle.fill",
  "square.and.pencil",
  "viewfinder",
];

/** The crossed box the set falls back to: one rectangle and one diagonal. */
const FALLBACK = iconStrokes("no.such.symbol", 22);

describe("iconStrokes", () => {
  it("draws every name in the set", () => {
    for (const name of NAMES) {
      expect(iconStrokes(name, 22).length, name).toBeGreaterThan(0);
    }
  });

  it("gives every name its own drawing rather than falling through", () => {
    for (const name of NAMES) {
      expect(iconStrokes(name, 22), name).not.toEqual(FALLBACK);
    }
  });

  it("falls back to a crossed box for an unknown name", () => {
    expect(FALLBACK).toHaveLength(2);
  });

  it("keeps every stroke inside the icon's box", () => {
    const size = 22;
    for (const name of NAMES) {
      for (const stroke of iconStrokes(name, size)) {
        for (const [x, y] of stroke.points) {
          expect(Math.abs(x), name).toBeLessThanOrEqual(size);
          expect(Math.abs(y), name).toBeLessThanOrEqual(size);
        }
      }
    }
  });

  it("scales with the icon's size", () => {
    const reach = (size: number) =>
      Math.max(
        ...iconStrokes("plus", size).flatMap((s) =>
          s.points.map(([x]) => Math.abs(x)),
        ),
      );
    expect(reach(44)).toBeGreaterThan(reach(22) * 1.8);
  });

  it("weights the ellipsis dots heavier so three small circles still read", () => {
    expect(iconStrokes("ellipsis", 22)[0].widthScale).toBeGreaterThan(1);
    expect(iconStrokes("plus", 22)[0].widthScale).toBeUndefined();
  });
});

describe("iconStrokeWidth", () => {
  it("scales with size but never gets too fine to see", () => {
    expect(iconStrokeWidth(40)).toBeCloseTo(3);
    expect(iconStrokeWidth(10)).toBe(1.3);
  });
});
