import { describe, expect, it } from "vitest";

import { visitMatcher } from "./placeVisits";

const PARIS = { lat: 48.8566, lng: 2.3522 };
const NEXT_DOOR = { lat: 48.8576, lng: 2.3522 };
const ACROSS_TOWN = { lat: 48.8836, lng: 2.3522 };
const LONDON = { lat: 51.5074, lng: -0.1278 };

describe("visitMatcher", () => {
  it("lets a mark without spots tick the name anywhere, ignoring case and accents", () => {
    const visited = visitMatcher([{ key: "caffedante" }]);
    expect(visited({ name: "Caffé Dante", ...PARIS })).toBe(true);
    expect(visited({ name: "CAFFE DANTE", ...LONDON, appleId: "L-1" })).toBe(
      true,
    );
    expect(visited({ name: "Micho", ...PARIS })).toBe(false);
  });

  it("does not tick a same-named place far from where the mark was made", () => {
    const visited = visitMatcher([
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
    const visited = visitMatcher([{ key: "blend", spots: [PARIS] }]);
    expect(visited({ name: "Blend", ...NEXT_DOOR })).toBe(true);
    expect(visited({ name: "Blend", ...NEXT_DOOR, appleId: "B-1" })).toBe(true);
    expect(visited({ name: "Blend", ...ACROSS_TOWN })).toBe(false);
    expect(visited({ name: "Micho", ...PARIS })).toBe(false);
  });

  it("keeps two branches of one name apart by their Apple ids", () => {
    const visited = visitMatcher([
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
    const visited = visitMatcher([
      { key: "franklinbbq", spots: [{ ...PARIS, appleId: "X" }] },
    ]);
    expect(
      visited({ name: "Franklin Barbecue", ...NEXT_DOOR, appleId: "X" }),
    ).toBe(true);
    expect(visited({ name: "Franklin Barbecue", ...NEXT_DOOR })).toBe(false);
  });

  it("ticks nothing without marks", () => {
    expect(visitMatcher([])({ name: "Blend", ...PARIS })).toBe(false);
  });
});
