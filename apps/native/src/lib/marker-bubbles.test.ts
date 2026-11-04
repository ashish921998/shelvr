import { describe, expect, it } from "vitest";
import {
  bubbleKey,
  bubbleSignature,
  parseBubbleKey,
  signatureKeys,
} from "./marker-bubbles";

describe("marker bubbles", () => {
  it("keeps one key per emoji and selected pair, whatever the pin order", () => {
    const signature = bubbleSignature([
      { emoji: "☕", selected: false },
      { emoji: "🍽️", selected: false },
      { emoji: "☕", selected: false },
      { emoji: "☕", selected: true },
    ]);
    expect(signatureKeys(signature)).toHaveLength(3);
    expect(
      bubbleSignature([
        { emoji: "☕", selected: true },
        { emoji: "🍽️", selected: false },
        { emoji: "☕", selected: false },
      ]),
    ).toBe(signature);
  });

  it("reads a key back into its emoji and selected state", () => {
    for (const request of [
      { emoji: "🍽️", selected: true },
      { emoji: "👨‍👩‍👧", selected: false },
    ]) {
      expect(parseBubbleKey(bubbleKey(request))).toEqual(request);
    }
  });

  it("has no keys when there are no pins", () => {
    expect(signatureKeys(bubbleSignature([]))).toEqual([]);
  });
});
