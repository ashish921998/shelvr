import { describe, expect, it } from "vitest";
import {
  GLOBE_CITY,
  REVEAL_COVERS,
  revealCovers,
  revealLayout,
} from "./trip-reveal";

const save = (
  id: string,
  extra: { status?: string; imageUrl?: string | null; cities?: string[] } = {},
) => ({
  _id: id,
  status: "ready",
  title: `Save ${id}`,
  imageUrl: `https://img.example/${id}.jpg`,
  ...extra,
});

describe("revealCovers", () => {
  it("lifts only ready saves that have a cover", () => {
    const covers = revealCovers(
      [
        save("a"),
        save("b", { status: "processing" }),
        save("c", { imageUrl: null }),
        save("d", { imageUrl: undefined }),
      ],
      undefined,
    );
    expect(covers.map((cover) => cover.id)).toEqual(["a"]);
  });

  it("puts the trip's city first and stops at six", () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) =>
        save(`other${i}`, { cities: ["Porto"] }),
      ),
      save("lisbon1", { cities: ["Lisbon"] }),
      save("lisbon2", { cities: ["Lisbon", "Sintra"] }),
    ];
    const covers = revealCovers(items, "Lisbon");
    expect(covers).toHaveLength(REVEAL_COVERS);
    expect(covers.slice(0, 2).map((cover) => cover.id)).toEqual([
      "lisbon1",
      "lisbon2",
    ]);
  });
});

describe("revealLayout", () => {
  it("matches the prototype on its own 390 x 844 screen", () => {
    const layout = revealLayout(390, 844, 6);
    expect(layout.cards).toHaveLength(6);
    expect(layout.cards[0]).toMatchObject({ left: 12, top: 228, width: 183 });
    expect(layout.cards[1].left).toBe(195);
    expect(layout.dots).toHaveLength(16);
    expect(layout.globe.left).toBe(-55);
    expect(layout.globe.diveX).toBe(-80);
  });

  it("sends every card's centre to its own dot", () => {
    const layout = revealLayout(430, 932, 6);
    for (const [index, card] of layout.cards.entries()) {
      const centreX = card.left + card.width / 2 + card.toX;
      const centreY = card.top + card.height / 2 + card.toY;
      expect(centreX).toBeCloseTo(layout.dots[index].x);
      expect(centreY).toBeCloseTo(layout.dots[index].y);
    }
  });

  it("dives the globe so its city sits where the dots land", () => {
    const { globe, landing } = revealLayout(393, 852, 3);
    expect(globe.left + GLOBE_CITY.x + globe.diveX).toBeCloseTo(landing.x);
    expect(globe.top + GLOBE_CITY.y + globe.diveY).toBeCloseTo(landing.y);
  });

  it("keeps the extra dots when only a few saves have covers", () => {
    const layout = revealLayout(390, 844, 2);
    expect(layout.cards).toHaveLength(2);
    expect(layout.dots).toHaveLength(12);
  });
});
