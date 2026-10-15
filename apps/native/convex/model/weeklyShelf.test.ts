import { describe, expect, it } from "vitest";
import { DIGEST_WINDOW_MS } from "./notificationFields";
import {
  ARCHIVE_CHECKS,
  archiveCheckOrder,
  archiveLimit,
  chooseRecent,
  composeShelf,
  shelfCandidates,
  weekStart,
  weeklyShuffle,
} from "./weeklyShelf";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 2, 4, 9);

type TestItem = {
  _id: string;
  _creationTime: number;
  status: "processing" | "ready" | "failed";
  type: "image" | "link" | "note";
};

function item(
  id: string,
  creationTime: number,
  overrides: Partial<TestItem> = {},
): TestItem {
  return {
    _id: id,
    _creationTime: creationTime,
    status: "ready",
    type: "note",
    ...overrides,
  };
}

const ids = (items: readonly { _id: string }[]) => items.map(({ _id }) => _id);

describe("shelfCandidates", () => {
  it("keeps only ready saves not on a recent shelf, newest first", () => {
    const items = [
      item("new", NOW - DAY),
      item("processing", NOW - DAY, { status: "processing" }),
      item("failed", NOW - 2 * DAY, { status: "failed" }),
      item("shown", NOW - 3 * DAY),
      item("old", NOW - 30 * DAY),
      item("older", NOW - 60 * DAY),
    ];

    const { recent, archive } = shelfCandidates(items, new Set(["shown"]), NOW);

    expect(ids(recent)).toEqual(["new"]);
    expect(ids(archive)).toEqual(["old", "older"]);
  });

  it("treats a save exactly seven days old as this week's", () => {
    const items = [
      item("boundary", NOW - DIGEST_WINDOW_MS),
      item("just-before", NOW - DIGEST_WINDOW_MS - 1),
    ];

    const { recent, archive } = shelfCandidates(items, new Set(), NOW);

    expect(ids(recent)).toEqual(["boundary"]);
    expect(ids(archive)).toEqual(["just-before"]);
  });
});

describe("chooseRecent", () => {
  it("takes the newest save of each type, then fills by recency", () => {
    const unopened = [
      item("link-1", 6, { type: "link" }),
      item("link-2", 5, { type: "link" }),
      item("image-1", 4, { type: "image" }),
      item("link-3", 3, { type: "link" }),
    ];

    expect(ids(chooseRecent(unopened))).toEqual([
      "link-1",
      "image-1",
      "link-2",
    ]);
  });

  it("returns fewer than a shelf when fewer are unopened", () => {
    expect(ids(chooseRecent([item("only", 1)]))).toEqual(["only"]);
    expect(chooseRecent([])).toEqual([]);
  });
});

describe("shelf composition", () => {
  const recent = ["r1", "r2", "r3"];
  const archive = ["a1", "a2", "a3"];

  // Each row: recent saves found, unopened older saves available, shelf.
  it.each([
    { found: 3, older: 3, shelf: ["r1", "r2", "a1"] },
    { found: 2, older: 3, shelf: ["r1", "r2", "a1"] },
    { found: 1, older: 3, shelf: ["r1", "a1", "a2"] },
    { found: 0, older: 3, shelf: ["a1", "a2", "a3"] },
    { found: 3, older: 0, shelf: ["r1", "r2", "r3"] },
    { found: 2, older: 0, shelf: ["r1", "r2"] },
    { found: 1, older: 1, shelf: ["r1", "a1"] },
  ])(
    "$found recent with $older older available makes $shelf",
    ({ found, older, shelf }) => {
      const chosenRecent = recent.slice(0, found);
      const chosenArchive = archive.slice(
        0,
        Math.min(older, archiveLimit(found)),
      );
      expect(composeShelf(chosenRecent, chosenArchive)).toEqual(shelf);
    },
  );

  it("looks for one older save even when the week fills the shelf", () => {
    expect([3, 2, 1, 0].map(archiveLimit)).toEqual([1, 1, 2, 3]);
  });
});

describe("archive order", () => {
  const archive = Array.from({ length: 80 }, (_, index) =>
    item(`old-${index}`, NOW - (8 + index) * DAY),
  );

  it("is the same for the same saves, user and week", () => {
    const first = archiveCheckOrder(archive, "user-a", NOW);
    const again = archiveCheckOrder([...archive], "user-a", NOW + DAY);

    expect(ids(again)).toEqual(ids(first));
  });

  it("changes from week to week and between users", () => {
    const thisWeek = ids(archiveCheckOrder(archive, "user-a", NOW));
    const nextWeek = ids(archiveCheckOrder(archive, "user-a", NOW + 7 * DAY));
    const otherUser = ids(archiveCheckOrder(archive, "user-b", NOW));

    expect(nextWeek).not.toEqual(thisWeek);
    expect(otherUser).not.toEqual(thisWeek);
  });

  it("pins the shuffle for fixed seeds", () => {
    const saves = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const week = weekStart(NOW);

    expect(weeklyShuffle(saves, `user-a:${week}`)).toEqual(
      weeklyShuffle(saves, `user-a:${week}`),
    );
    expect(weeklyShuffle(saves, `user-a:${week}`)).toMatchInlineSnapshot(`
      [
        "a",
        "d",
        "b",
        "g",
        "f",
        "h",
        "e",
        "c",
      ]
    `);
    expect(weeklyShuffle(saves, `user-a:${week + 7 * DAY}`))
      .toMatchInlineSnapshot(`
        [
          "g",
          "d",
          "c",
          "b",
          "h",
          "f",
          "e",
          "a",
        ]
      `);
  });

  it(`checks at most ${ARCHIVE_CHECKS} older saves`, () => {
    const order = archiveCheckOrder(archive, "user-a", NOW);

    expect(order).toHaveLength(ARCHIVE_CHECKS);
    expect(new Set(ids(order)).size).toBe(ARCHIVE_CHECKS);
  });
});
