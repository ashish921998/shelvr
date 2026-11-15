import { describe, expect, it } from "vitest";

import type { Placed } from "./placeIdentity";
import { type VisitMark, visitedKeysOnItem, visitMatcher } from "./placeVisits";

const PARIS = { lat: 48.8566, lng: 2.3522 };
const NEXT_DOOR = { lat: 48.8576, lng: 2.3522 };
const ACROSS_TOWN = { lat: 48.8836, lng: 2.3522 };
const LONDON = { lat: 51.5074, lng: -0.1278 };

function alone(visits: VisitMark[]) {
  return (pin: Placed) => visitMatcher(visits, [pin])(pin);
}

describe("visitMatcher", () => {
  it("lets a mark without spots tick the name anywhere, ignoring case and accents", () => {
    const visited = alone([{ key: "caffedante" }]);
    expect(visited({ name: "Caffé Dante", ...PARIS })).toBe(true);
    expect(visited({ name: "CAFFE DANTE", ...LONDON, appleId: "L-1" })).toBe(
      true,
    );
    expect(visited({ name: "Micho", ...PARIS })).toBe(false);
  });

  it("does not tick a same-named place far from where the mark was made", () => {
    const visited = alone([
      { key: "shakeshack", spots: [{ ...PARIS, appleId: "P-1" }] },
    ]);
    expect(visited({ name: "Shake Shack", ...PARIS, appleId: "P-1" })).toBe(
      true,
    );
    expect(visited({ name: "Shake Shack", ...LONDON, appleId: "L-1" })).toBe(
      false,
    );
    expect(visited({ name: "Shake Shack", ...LONDON })).toBe(false);
  });

  it("ticks the same name a few doors away when an Apple id is missing", () => {
    const visited = alone([{ key: "blend", spots: [PARIS] }]);
    expect(visited({ name: "Blend", ...NEXT_DOOR })).toBe(true);
    expect(visited({ name: "Blend", ...NEXT_DOOR, appleId: "B-1" })).toBe(true);
    expect(visited({ name: "Blend", ...ACROSS_TOWN })).toBe(false);
    expect(visited({ name: "Micho", ...PARIS })).toBe(false);
  });

  it("keeps two branches of one name apart by their Apple ids", () => {
    const visited = alone([
      { key: "bluebottlecoffee", spots: [{ ...PARIS, appleId: "A" }] },
    ]);
    expect(
      visited({ name: "Blue Bottle Coffee", ...NEXT_DOOR, appleId: "A" }),
    ).toBe(true);
    expect(
      visited({ name: "Blue Bottle Coffee", ...NEXT_DOOR, appleId: "B" }),
    ).toBe(false);
    expect(
      visited({ name: "Blue Bottle Coffee", ...ACROSS_TOWN, appleId: "B" }),
    ).toBe(false);
  });

  it("ticks another name for the marked venue by its Apple id", () => {
    const visited = alone([
      { key: "franklinbbq", spots: [{ ...PARIS, appleId: "X" }] },
    ]);
    expect(
      visited({ name: "Franklin Barbecue", ...NEXT_DOOR, appleId: "X" }),
    ).toBe(true);
    expect(visited({ name: "Franklin Barbecue", ...NEXT_DOOR })).toBe(false);
  });

  it("ticks only the nearest branch for a mark without an Apple id", () => {
    const near = { name: "Blue Bottle Coffee", ...PARIS, appleId: "A" };
    const nextDoor = { name: "Blue Bottle Coffee", ...NEXT_DOOR, appleId: "B" };
    const visited = visitMatcher(
      [{ key: "bluebottlecoffee", spots: [PARIS] }],
      [nextDoor, near],
    );
    expect([visited(near), visited(nextDoor)]).toEqual([true, false]);
  });

  it("names a save's place visited only where its mark was made", () => {
    const dallas = { placePins: [{ name: "Jo's Coffee", ...LONDON }] };
    expect(
      visitedKeysOnItem([{ key: "joscoffee", spots: [PARIS] }], dallas),
    ).toEqual(new Set());
    expect(
      visitedKeysOnItem([{ key: "joscoffee", spots: [LONDON] }], dallas),
    ).toEqual(new Set(["joscoffee"]));
    expect(
      visitedKeysOnItem([{ key: "joscoffee" }], { placePins: [] }),
    ).toEqual(new Set(["joscoffee"]));
  });

  it("does not count a location-only mark on a second nearby save", () => {
    const name = "Tigre";
    const visits = [{ key: "tigre", spots: [PARIS] }];
    expect(
      visitedKeysOnItem(visits, {
        placePins: [{ name, ...PARIS, appleId: "A" }],
      }),
    ).toEqual(new Set(["tigre"]));
    expect(
      visitedKeysOnItem(visits, {
        placePins: [{ name, ...NEXT_DOOR, appleId: "B" }],
      }),
    ).toEqual(new Set());
  });

  it("does not move a location-only mark to the branch next door when its venue gains a scoped mark", () => {
    const name = "Tigre";
    const first = { name, ...PARIS, appleId: "A" };
    const second = { name, ...NEXT_DOOR };
    const visited = visitMatcher(
      [{ key: "tigre", spots: [PARIS, first] }],
      [first, second],
    );
    expect([visited(first), visited(second)]).toEqual([true, false]);
  });

  it("ticks nothing without marks", () => {
    expect(alone([])({ name: "Blend", ...PARIS })).toBe(false);
  });
});
