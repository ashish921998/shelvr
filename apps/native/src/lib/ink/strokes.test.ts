import { describe, expect, it } from "vitest";
import {
  doodleStrokes,
  markFill,
  markStrokes,
  propStrokes,
  shelfStrokes,
  SHELF_PHASES,
  type MarkKind,
  type PropKind,
} from "./strokes";

const MARKS: MarkKind[] = [
  "note",
  "recipe",
  "article",
  "photo",
  "product",
  "video",
  "camera",
];
const PROPS: PropKind[] = ["mug", "plant", "clock", "candle", "books"];

describe("markStrokes", () => {
  it("draws every save kind with at least two strokes", () => {
    for (const kind of MARKS) {
      expect(markStrokes(kind, 10).length, kind).toBeGreaterThan(1);
    }
  });

  it("scales with its half-size, so the same mark works as a sticker and a list icon", () => {
    const small = markStrokes("article", 5);
    const large = markStrokes("article", 10);
    const extent = (s: typeof small) =>
      Math.max(
        ...s.flatMap((stroke) => stroke.points.map(([x]) => Math.abs(x))),
      );
    expect(extent(large)).toBeGreaterThan(extent(small) * 1.5);
  });

  it("gives the article mark a heavier heading bar than its body lines", () => {
    const [, heading, body] = markStrokes("article", 10);
    expect(heading.widthScale).toBeGreaterThan(1);
    expect(body.widthScale).toBeUndefined();
  });

  it("draws video as the photo mark, and only video carries a fill", () => {
    expect(markStrokes("video", 10)).toEqual(markStrokes("photo", 10));
    expect(markFill("video", 10)).not.toBeNull();
    for (const kind of MARKS.filter((k) => k !== "video")) {
      expect(markFill(kind, 10), kind).toBeNull();
    }
  });

  it("adds a lens to the camera mark that the product mark does not have", () => {
    expect(markStrokes("camera", 10).length).toBeGreaterThan(
      markStrokes("product", 10).length,
    );
  });
});

describe("shelfStrokes", () => {
  it("draws the board heavier than its underside", () => {
    const { board, under } = shelfStrokes(0, 200, 8);
    expect(board.widthScale).toBeGreaterThan(1);
    expect(under.widthScale).toBeLessThan(1);
  });

  it("hangs the underside below the board and sets brackets in from each end", () => {
    const { board, under, brackets } = shelfStrokes(0, 200, 8);
    expect(under.points[0][1]).toBeGreaterThan(board.points[0][1]);
    expect(brackets).toHaveLength(2);
    // Within the pen's wobble of 22 in from each end.
    expect(Math.abs(brackets[0].points[0][0] - 22)).toBeLessThan(1);
    expect(Math.abs(brackets[1].points[0][0] - 178)).toBeLessThan(1);
  });

  it("orders its three phases board, underside, brackets", () => {
    expect(SHELF_PHASES.board[1]).toBe(SHELF_PHASES.under[0]);
    expect(SHELF_PHASES.under[1]).toBe(SHELF_PHASES.brackets[0]);
    expect(SHELF_PHASES.brackets[1]).toBe(1);
  });
});

describe("props and doodles", () => {
  it("draws every prop", () => {
    for (const kind of PROPS) {
      expect(propStrokes(kind, 12).length, kind).toBeGreaterThan(0);
    }
  });

  it("gives a plant a pot, three stems and three leaves", () => {
    expect(propStrokes("plant", 12)).toHaveLength(7);
  });

  it("reuses the mug prop and the recipe mark as headline doodles", () => {
    expect(doodleStrokes("mug", 20)).toEqual(propStrokes("mug", 20 * 0.55));
    expect(doodleStrokes("recipe", 20)).toEqual(
      markStrokes("recipe", 20 * 0.85),
    );
  });

  it("gives the magnifier a heavier handle than its lens", () => {
    const [, handle] = doodleStrokes("magnifier", 20);
    expect(handle.widthScale).toBeGreaterThan(1);
  });

  it("draws the sun's disc plus nine rays", () => {
    expect(doodleStrokes("sun", 20)).toHaveLength(10);
  });
});
