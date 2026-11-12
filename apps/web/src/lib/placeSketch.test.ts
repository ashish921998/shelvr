import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { placeSketch } from "./placeSketch";

const names = (count: number) =>
  Array.from({ length: count }, (_, i) => `Place ${i + 1}`);

const LABELS: [string, string][] = [
  ["Miradouro da Senhora do Monte", "Miradouro…"],
  ["Time Out Market", "Time Out…"],
  ["Pastéis de Belém", "Pastéis de…"],
  ["Blue Bottle Coffee Kiyosumi", "Blue Bottle…"],
  ["A Cevicheria", "A Cevicheria"],
  ["Manteigaria", "Manteigaria"],
  ["  LX Factory  ", "LX Factory"],
  ["東京スカイツリータウン", "東京スカイ…"],
  ["浅草寺", "浅草寺"],
  ["明治神宮外苑いちょう並木", "明治神宮外…"],
  ["Pastelaria🇵🇹 Lisboa", "Pastelaria…"],
  ["🇵🇹 Casa Portuguesa do Pastel", "🇵🇹 Casa…"],
  ["\u{1F469}‍\u{1F373} Chef Maria's Kitchen", "\u{1F469}‍\u{1F373} Chef…"],
  ["Pastéis de Belém".normalize("NFD"), "Pastéis de…".normalize("NFD")],
  ["PizzaRoma🇮🇹", "PizzaRoma🇮🇹"],
  ["PizzaRoma🇮🇹 Bistro", "PizzaRoma🇮🇹…"],
  ["PizzaRoma👩🏽‍🍳 Bistro", "PizzaRoma👩🏽‍🍳…"],
  ["PizzeriaCafé".normalize("NFD"), "PizzeriaCafé".normalize("NFD")],
];

const labelOf = (name: string) => placeSketch([name]).pins[0].label;

describe("placeSketch layout", () => {
  it("draws nothing for no places", () => {
    expect(placeSketch([])).toEqual({ height: 0, pins: [], more: 0 });
  });

  it("centres one place", () => {
    const sketch = placeSketch(names(1));
    expect(sketch.pins.map((pin) => pin.x)).toEqual([160]);
    expect(sketch.height).toBe(106);
  });

  it("centres up to three places in one row", () => {
    const xs = placeSketch(names(3)).pins.map((pin) => pin.x);
    expect(xs[0]).toBeCloseTo(82.7, 1);
    expect(xs[1]).toBe(160);
    expect(xs[2]).toBeCloseTo(237.3, 1);
  });

  it("spreads four places across one row", () => {
    const sketch = placeSketch(names(4));
    const xs = sketch.pins.map((pin) => pin.x);
    expect(xs[0]).toBe(44);
    expect(xs[3]).toBe(276);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(sketch.height).toBe(106);
  });

  it("snakes the fifth place under the fourth", () => {
    const sketch = placeSketch(names(5));
    expect(sketch.pins[4].x).toBe(276);
    expect(sketch.pins[4].x).toBe(sketch.pins[3].x);
    expect(sketch.pins[4].y).toBeGreaterThan(sketch.pins[3].y);
    expect(sketch.height).toBe(192);
  });

  it("runs the second of three rows right to left", () => {
    const sketch = placeSketch(names(10));
    const rows = [
      sketch.pins.slice(0, 4),
      sketch.pins.slice(4, 8),
      sketch.pins.slice(8),
    ];
    const top = (row: typeof sketch.pins) =>
      Math.min(...row.map((pin) => pin.y));
    const bottom = (row: typeof sketch.pins) =>
      Math.max(...row.map((pin) => pin.y));
    expect(bottom(rows[0])).toBeLessThan(top(rows[1]));
    expect(bottom(rows[1])).toBeLessThan(top(rows[2]));
    expect(rows[1].map((pin) => pin.x)).toEqual([276, 198.7, 121.3, 44]);
    expect(rows[2].map((pin) => pin.x)).toEqual([44, 121.3]);
    expect(sketch.height).toBe(278);
  });

  it("stops at ten pins and counts the rest", () => {
    const sketch = placeSketch(names(13));
    expect(sketch.pins).toHaveLength(10);
    expect(sketch.more).toBe(3);
    expect(sketch.height).toBe(300);
  });

  it("keeps every pin inside the box and numbers them in order", () => {
    for (let count = 1; count <= 13; count += 1) {
      const sketch = placeSketch(names(count));
      sketch.pins.forEach((pin, i) => {
        expect(pin.n).toBe(i + 1);
        expect(pin.x).toBeGreaterThanOrEqual(15);
        expect(pin.x).toBeLessThanOrEqual(305);
        expect(pin.y).toBeGreaterThanOrEqual(15);
        expect(pin.y).toBeLessThanOrEqual(sketch.height - 15);
      });
    }
  });
});

describe.each(["native", "fallback"])("placeSketch labels (%s)", (mode) => {
  beforeEach(() => {
    if (mode === "fallback") vi.stubGlobal("Intl", { Segmenter: undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(LABELS)("labels %s as %s", (name, label) => {
    expect(labelOf(name)).toBe(label);
  });

  it.each(LABELS)("cuts %s only at its end", (name) => {
    const label = labelOf(name);
    expect(name.trim().startsWith(label.replace(/…$/, ""))).toBe(true);
  });

  it("keeps the labels in list order", () => {
    const sketch = placeSketch(LABELS.map(([name]) => name).slice(0, 4));
    expect(sketch.pins.map((pin) => pin.label)).toEqual(
      LABELS.slice(0, 4).map(([, label]) => label),
    );
  });
});
