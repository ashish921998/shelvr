import { describe, expect, it } from "vitest";

import { type Reveal, revealSchema } from "./schema";
import { decodeReveal, encodeReveal } from "./shareCode";

const REVEALS: Reveal[] = [
  {
    lens: "era",
    title: "Your Slow Sunday Era",
    tagline: "Linen, sourdough, and a café you have not visited yet.",
    evidence: [
      "The sourdough starter guide in your second screenshot",
      "That Lisbon café with the tiled counter",
    ],
  },
  {
    lens: "roast",
    heat: "spicy",
    lines: [
      "Four air fryer recipes and not one vegetable.",
      "You saved the same sneaker drop twice. It sold out once.",
      "A 30-day plank challenge, day zero, forever.",
    ],
    closer: "Honestly? Iconic hoarding.",
  },
  {
    lens: "taste",
    label: "Sunlit Maximalist",
    description: "Warm clutter that somehow always looks intentional.",
    keywords: ["terracotta", "rattan", "brass", "ferns"],
    palette: ["#e6a23c", "#9a6416", "#faf6ee", "#2b2418"],
  },
  {
    lens: "find",
    matches: [
      {
        guess: "Café Ñandú, Lisbon — “the tiled one”",
        kind: "place",
        confidence: "medium",
        check: "Compare the counter tiles on Google Maps photos.",
        searchQuery: "tiled counter café Lisbon Príncipe Real",
      },
    ],
  },
];

describe("share codes", () => {
  it.each(REVEALS)("round-trips a $lens reveal", (reveal) => {
    const code = encodeReveal(reveal);

    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeReveal(code)).toEqual(reveal);
  });

  it("keeps the longest allowed era reveal under the code limit", () => {
    const code = encodeReveal({
      lens: "era",
      title: "t".repeat(80),
      tagline: "t".repeat(400),
      evidence: Array(4).fill("e".repeat(200)),
    });

    expect(code.length).toBeLessThanOrEqual(4096);
    expect(decodeReveal(code)).toBeDefined();
  });

  it("rejects a valid reveal whose code is over 4 KB", () => {
    const wide: Reveal = {
      lens: "era",
      title: "€".repeat(80),
      tagline: "€".repeat(400),
      evidence: Array(4).fill("€".repeat(200)),
    };
    const code = encodeReveal(wide);

    expect(revealSchema.parse(wide)).toEqual(wide);
    expect(code.length).toBeGreaterThan(4096);
    expect(decodeReveal(code)).toBeUndefined();
  });

  it.each([
    ["an empty code", ""],
    ["garbage", "!!not base64!!"],
    ["base64 that is not JSON", btoa("hello world")],
    [
      "an unknown lens",
      encodeReveal({ lens: "horoscope" } as unknown as Reveal),
    ],
    [
      "a reveal missing fields",
      encodeReveal({ lens: "era", title: "Only a title" } as unknown as Reveal),
    ],
    [
      "a palette that is not hex",
      encodeReveal({
        ...REVEALS[2],
        palette: ["red", "#fff", "url(x)", "#000000"],
      } as Reveal),
    ],
  ])("decodes %s to undefined", (_, code) => {
    expect(decodeReveal(code)).toBeUndefined();
  });
});
