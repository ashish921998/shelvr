import { describe, expect, it } from "vitest";
import { groupIntoShelves } from "./home-shelves";

const NOW = Date.UTC(2026, 8, 18);
const daysAgo = (days: number) => NOW - days * 24 * 60 * 60 * 1000;

describe("groupIntoShelves", () => {
  it("puts this week's saves on one shelf and the rest on another", () => {
    const shelves = groupIntoShelves(
      [{ _creationTime: daysAgo(1) }, { _creationTime: daysAgo(30) }],
      NOW,
    );
    expect(shelves.map((s) => s.section)).toEqual(["new", "earlier"]);
    expect(shelves[0].items).toHaveLength(1);
    expect(shelves[1].items).toHaveLength(1);
  });

  it("keeps the feed's order inside a shelf", () => {
    const items = [
      { _creationTime: daysAgo(1), id: "a" },
      { _creationTime: daysAgo(3), id: "b" },
      { _creationTime: daysAgo(2), id: "c" },
    ];
    expect(groupIntoShelves(items, NOW)[0].items.map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("leaves out a shelf with nothing on it rather than drawing it empty", () => {
    expect(
      groupIntoShelves([{ _creationTime: daysAgo(1) }], NOW).map(
        (s) => s.section,
      ),
    ).toEqual(["new"]);
    expect(
      groupIntoShelves([{ _creationTime: daysAgo(9) }], NOW).map(
        (s) => s.section,
      ),
    ).toEqual(["earlier"]);
    expect(groupIntoShelves([], NOW)).toEqual([]);
  });

  it("counts a save exactly a week old as still new", () => {
    expect(
      groupIntoShelves([{ _creationTime: daysAgo(7) }], NOW)[0].section,
    ).toBe("new");
    expect(
      groupIntoShelves([{ _creationTime: daysAgo(7.01) }], NOW)[0].section,
    ).toBe("earlier");
  });

  it("treats a save the server has not echoed back yet as new", () => {
    expect(groupIntoShelves([{}], NOW)[0].section).toBe("new");
  });
});
