// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PublicMapPlace } from "@/lib/publicMap";

import MapSketch from "./MapSketch";

const contramar: PublicMapPlace = {
  name: "Contramar",
  lat: 19.419,
  lng: -99.166,
  emoji: "🍽️",
  went: true,
};
const rosetta: PublicMapPlace = {
  name: "Panadería Rosetta",
  lat: 19.42,
  lng: -99.161,
  emoji: "🥐",
  went: false,
};
const orinoco: PublicMapPlace = {
  name: "Taquería Orinoco",
  lat: 19.418,
  lng: -99.164,
  went: false,
};
const avellaneda: PublicMapPlace = {
  name: "Café Avellaneda",
  lat: 19.348,
  lng: -99.162,
  emoji: "☕",
  went: false,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(places: PublicMapPlace[]) {
  act(() => root.render(<MapSketch city="Mexico City" places={places} />));
  return container.querySelector("svg")!;
}

function markerTitles(svg: SVGSVGElement) {
  return Array.from(svg.querySelectorAll("g > title"), (title) =>
    title.textContent?.trim(),
  );
}

function markerCentres(svg: SVGSVGElement) {
  return Array.from(svg.querySelectorAll(":scope > g"), (group) => {
    const [x, y] = (group.getAttribute("transform") ?? "")
      .replace(/[^\d.\s-]/g, " ")
      .trim()
      .split(/\s+/)
      .map(Number);
    return { x, y };
  });
}

describe("MapSketch", () => {
  it("names the sketch and labels it with its title", () => {
    const svg = render([contramar, rosetta, orinoco]);
    const title = svg.querySelector(":scope > title")!;
    expect(title.textContent).toBe("Sketch of 3 places in Mexico City");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-labelledby")).toBe(title.id);
  });

  it("titles each marker with its place, Been there drawn last", () => {
    const svg = render([contramar, rosetta, orinoco]);
    expect(markerTitles(svg)).toEqual([
      "Panadería Rosetta",
      "Taquería Orinoco",
      "Contramar",
    ]);
  });

  it("badges only Been there markers, and dots a place without an emoji", () => {
    const svg = render([contramar, rosetta, orinoco]);
    expect(svg.querySelectorAll('circle[r="5"]')).toHaveLength(1);
    expect(svg.textContent).toContain("✓");
    expect(svg.querySelectorAll('circle[r="3"]')).toHaveLength(1);
    expect(svg.textContent).toContain("🥐");
  });

  it("draws no badge when nothing is Been there", () => {
    const svg = render([rosetta, orinoco]);
    expect(svg.querySelectorAll('circle[r="5"]')).toHaveLength(0);
    expect(svg.textContent).not.toContain("✓");
    expect(svg.querySelector(":scope > title")?.textContent).toBe(
      "Sketch of 2 places in Mexico City",
    );
  });

  it("keeps close places from covering each other when a far one widens the sketch", () => {
    const centres = markerCentres(
      render([contramar, avellaneda, rosetta, orinoco]),
    );
    expect(centres).toHaveLength(4);
    const gaps = centres.flatMap((a, index) =>
      centres.slice(index + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)),
    );
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(24);
  });

  it("says one place in the singular", () => {
    const svg = render([rosetta]);
    expect(svg.querySelector(":scope > title")?.textContent).toBe(
      "Sketch of 1 place in Mexico City",
    );
  });
});
