import { describe, expect, it } from "vitest";

import { CARD_MAX_PINS, cardPoints } from "@/lib/city-card";

const box = { width: 300, height: 400, pad: 20 };

describe("cardPoints", () => {
  it("draws nothing without pins", () => {
    expect(cardPoints([], box)).toEqual([]);
  });

  it("centres a lone pin", () => {
    const [point] = cardPoints([{ lat: 30.26, lng: -97.74 }], box);
    expect(point).toMatchObject({ x: 150, y: 200 });
  });

  it("keeps every pin inside the padded box, north up", () => {
    const pins = [
      { lat: 30.3, lng: -97.8 },
      { lat: 30.2, lng: -97.7 },
      { lat: 30.25, lng: -97.75 },
    ];
    const points = cardPoints(pins, box);
    for (const { x, y } of points) {
      expect(x).toBeGreaterThanOrEqual(box.pad);
      expect(x).toBeLessThanOrEqual(box.width - box.pad);
      expect(y).toBeGreaterThanOrEqual(box.pad);
      expect(y).toBeLessThanOrEqual(box.height - box.pad);
    }
    const north = points.find((point) => point.pin.lat === 30.3);
    const south = points.find((point) => point.pin.lat === 30.2);
    expect(north!.y).toBeLessThan(south!.y);
  });

  it("draws at most the card's pin limit", () => {
    const pins = Array.from({ length: CARD_MAX_PINS + 5 }, (_, i) => ({
      lat: 30 + i / 1000,
      lng: -97.7,
    }));
    expect(cardPoints(pins, box)).toHaveLength(CARD_MAX_PINS);
  });

  it("keeps the visited places when it cuts the oldest saves", () => {
    const pins = Array.from({ length: CARD_MAX_PINS + 5 }, (_, i) => ({
      lat: 30 + i / 1000,
      lng: -97.7,
      visited: i >= CARD_MAX_PINS + 2,
    }));
    const points = cardPoints(pins, box, (pin) => pin.visited);
    expect(points).toHaveLength(CARD_MAX_PINS);
    expect(points.filter((point) => point.pin.visited)).toHaveLength(3);
    expect(points.map((point) => point.pin)).toEqual([
      ...pins.slice(CARD_MAX_PINS + 2),
      ...pins.slice(0, CARD_MAX_PINS - 3),
    ]);
  });
});
