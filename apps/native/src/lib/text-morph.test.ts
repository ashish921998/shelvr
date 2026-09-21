import { describe, expect, it } from "vitest";
import {
  MAX_MORPH_GLYPHS,
  layoutMorphText,
  pruneMorphCells,
  reconcileMorphCells,
  type MorphCell,
} from "./text-morph";

// Every glyph advances 10px, so widths and centering are easy to predict.
const advance10 = () => 10;

describe("layoutMorphText", () => {
  it("returns no cells for an unusable slot", () => {
    expect(layoutMorphText("abc", 0, 0, advance10)).toEqual([]);
    expect(layoutMorphText("abc", -5, 0, advance10)).toEqual([]);
  });

  it("lays glyphs out left to right, centered in the slot", () => {
    const cells = layoutMorphText("abc", 240, 0, advance10);
    expect(cells.map((cell) => cell.char).join("")).toBe("abc");
    expect(cells.map((cell) => cell.x)).toEqual([105, 115, 125]);
    expect(cells.every((cell) => cell.phase === "present")).toBe(true);
    // A fresh scene never waits on an entrance: it renders opaque.
    expect(cells.every((cell) => cell.animateIn === undefined)).toBe(true);
  });

  it("offsets the whole run by the canvas overscan", () => {
    const cells = layoutMorphText("abc", 240, 32, advance10);
    expect(cells[0]?.x).toBe(137);
    expect(cells[2]?.x).toBe(157);
  });

  it("keys repeated characters by occurrence so identities stay stable", () => {
    const cells = layoutMorphText("aaa", 240, 0, advance10);
    expect(cells.map((cell) => cell.key)).toEqual(["a#0", "a#1", "a#2"]);
  });

  it("clamps a negative measured advance to zero", () => {
    const cells = layoutMorphText("ab", 240, 0, (char) =>
      char === "a" ? -3 : 10,
    );
    expect(cells[0]?.x).toBe(115);
    expect(cells[1]?.x).toBe(115);
  });

  it("truncates with an ellipsis when the run exceeds the slot", () => {
    // 5 glyphs x 10px = 50 > 45: drops the last glyph, appends "…" (10px).
    const cells = layoutMorphText("abcde", 45, 0, advance10);
    expect(cells.map((cell) => cell.char).join("")).toBe("abc…");
    expect(cells).toHaveLength(4);
    // The truncated run (40px) is centered in the 45px slot.
    expect(cells[0]?.x).toBe(2.5);
  });

  it("bounds the run without an ellipsis when truncation is off", () => {
    const cells = layoutMorphText("abcde", 45, 0, advance10, false);
    expect(cells.map((cell) => cell.char).join("")).toBe("abcd");
  });

  it("caps the scene at the glyph budget, including zero-width glyphs", () => {
    const cells = layoutMorphText("a".repeat(200), 1000, 0, advance10);
    expect(cells).toHaveLength(MAX_MORPH_GLYPHS);
    expect(cells.at(-1)?.char).toBe("…");

    // Spaces measure 0px but still consume the budget, so a long note padded
    // with whitespace cannot allocate an unbounded scene.
    const spaces = layoutMorphText("a" + " ".repeat(100), 1000, 0, (char) =>
      char === " " ? 0 : 10,
    );
    expect(spaces).toHaveLength(MAX_MORPH_GLYPHS);
  });
});

describe("reconcileMorphCells", () => {
  const cellA: MorphCell = {
    key: "a#0",
    char: "a",
    x: 0,
    width: 10,
    index: 0,
    phase: "present",
  };
  const cellB: MorphCell = {
    key: "b#0",
    char: "b",
    x: 10,
    width: 10,
    index: 1,
    phase: "present",
  };
  const previous: MorphCell[] = [
    cellA,
    cellB,
    { key: "c#0", char: "c", x: 20, width: 10, index: 2, phase: "present" },
  ];

  it("keeps surviving glyphs, marks added ones entering, retires the rest", () => {
    const present = layoutMorphText("bd", 240, 0, advance10);
    const next = reconcileMorphCells(previous, present, 1000, 240, 25);
    const byKey = new Map(next.map((cell) => [cell.key, cell]));

    expect(byKey.get("b#0")?.animateIn).toBe(false); // persisted
    expect(byKey.get("d#0")?.animateIn).toBe(true); // added
    expect(byKey.get("a#0")?.phase).toBe("exit"); // retired
    expect(byKey.get("c#0")?.phase).toBe("exit");
    // Present cells come first so they win any budget contention.
    expect(next[0]?.key).toBe("b#0");
    expect(next[1]?.key).toBe("d#0");
  });

  it("schedules each retirement after the exit duration plus its stagger", () => {
    const present = layoutMorphText("d", 240, 0, advance10);
    const next = reconcileMorphCells(previous, present, 1000, 240, 25);
    const byKey = new Map(next.map((cell) => [cell.key, cell]));

    expect(byKey.get("a#0")?.exitAt).toBe(1000 + 240 + 0 * 25);
    expect(byKey.get("c#0")?.exitAt).toBe(1000 + 240 + 2 * 25);
  });

  it("keeps a returning letter out of the entrance stagger", () => {
    // "a" left the scene and came back before its exit finished: it resumes
    // in place instead of replaying the signature entrance.
    const retiring: MorphCell[] = [
      { ...cellA, phase: "exit", exitAt: 1500 },
      { ...cellB, phase: "exit", exitAt: 1500 },
    ];
    const present = layoutMorphText("ab", 240, 0, advance10);
    const next = reconcileMorphCells(retiring, present, 1000, 240, 25);
    const byKey = new Map(next.map((cell) => [cell.key, cell]));

    expect(byKey.get("a#0")?.animateIn).toBe(false);
    expect(byKey.get("a#0")?.phase).toBe("present");
  });

  it("drops finished exits and keeps running ones on their deadline", () => {
    const retiring: MorphCell[] = [
      { ...cellA, phase: "exit", exitAt: 900 },
      { ...cellB, phase: "exit", exitAt: 1200 },
    ];
    const present = layoutMorphText("z", 240, 0, advance10);
    const next = reconcileMorphCells(retiring, present, 1000, 240, 25);
    const byKey = new Map(next.map((cell) => [cell.key, cell]));

    expect(byKey.has("a#0")).toBe(false); // deadline passed
    expect(byKey.get("b#0")?.exitAt).toBe(1200); // deadline unchanged
  });

  it("returns only the present scene, fully opaque, when interrupted", () => {
    const present = layoutMorphText("bd", 240, 0, advance10);
    const next = reconcileMorphCells(previous, present, 1000, 240, 25, true);

    expect(next.map((cell) => cell.phase)).toEqual(["present", "present"]);
    expect(next.every((cell) => cell.animateIn === false)).toBe(true);
    expect(next.every((cell) => cell.exitAt === undefined)).toBe(true);
  });

  it("bounds the retiring layer so a burst cannot flood the scene", () => {
    const many: MorphCell[] = Array.from({ length: 60 }, (_, index) => ({
      key: `g#${index}`,
      char: "g",
      x: index * 10,
      width: 10,
      index,
      phase: "present" as const,
    }));
    const next = reconcileMorphCells(many, [], 1000, 240, 25);

    expect(next).toHaveLength(MAX_MORPH_GLYPHS);
    expect(next.every((cell) => cell.phase === "exit")).toBe(true);
  });
});

describe("pruneMorphCells", () => {
  it("keeps present glyphs and pending exits, drops completed exits", () => {
    const cells: MorphCell[] = [
      { key: "a#0", char: "a", x: 0, width: 10, index: 0, phase: "present" },
      {
        key: "b#0",
        char: "b",
        x: 10,
        width: 10,
        index: 1,
        phase: "exit",
        exitAt: 1200,
      },
      {
        key: "c#0",
        char: "c",
        x: 20,
        width: 10,
        index: 2,
        phase: "exit",
        exitAt: 1000,
      },
    ];
    const kept = pruneMorphCells(cells, 1000);
    expect(kept.map((cell) => cell.key)).toEqual(["a#0", "b#0"]);
    // An exit whose deadline is exactly now has finished.
    expect(pruneMorphCells(cells, 1200).map((cell) => cell.key)).toEqual([
      "a#0",
    ]);
  });
});
