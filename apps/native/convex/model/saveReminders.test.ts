import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  COOK_MIN_AGE_MS,
  DEFAULT_REMINDER_HOUR,
  MIN_GAP_MS,
  READ_MAX_AGE_MS,
  READ_MIN_AGE_MS,
  VISIT_MIN_AGE_MS,
  WEEK_MS,
  openedTooRecently,
  placeToVisit,
  preferredReminderHour,
  reminderBlocked,
  reminderCandidates,
  reminderKind,
  reminderSubject,
} from "./saveReminders";
import { placeKey } from "./plan";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-25T18:00:00Z");

let next = 0;
function item(fields: Partial<Doc<"items">> = {}): Doc<"items"> {
  next += 1;
  return {
    _id: `item-${next}` as Id<"items">,
    _creationTime: NOW - 2 * DAY,
    userId: "user-a",
    type: "link",
    status: "ready",
    title: `Save ${next}`,
    tags: [],
    searchText: "",
    ...fields,
  };
}

const article = (fields: Partial<Doc<"items">> = {}) =>
  item({ content: "A long read about bread.", ...fields });
const recipe = (fields: Partial<Doc<"items">> = {}) =>
  item({
    _creationTime: NOW - 10 * DAY,
    title: "The best lasagna recipe you will ever make",
    recipe: { name: "Lasagna", ingredients: ["pasta"], steps: ["bake"] },
    ...fields,
  });

const been = (...names: string[]) => new Set(names.map(placeKey));
const spot = (fields: Partial<Doc<"items">> = {}) =>
  item({
    _creationTime: NOW - 5 * DAY,
    url: "https://www.instagram.com/reel/Cabc123/",
    places: ["As Bifanas do Afonso", "Castelo de São Jorge"],
    ...fields,
  });

describe("asking about a saved place", () => {
  it("names the first place the owner has not been to", () => {
    expect(placeToVisit(spot(), new Set())).toBe("As Bifanas do Afonso");
    expect(placeToVisit(spot(), been("As Bifanas do Afonso"))).toBe(
      "Castelo de São Jorge",
    );
  });

  it("asks about the venue, not its area or a street address", () => {
    const places = ["12 Main Street", "Time Out Market, Cais do Sodré, Lisbon"];
    expect(placeToVisit(spot({ places }), new Set())).toBe("Time Out Market");
    expect(
      placeToVisit(spot({ places }), been("Time Out Market")),
    ).toBeUndefined();
    expect(placeToVisit(spot({ places }), been(places[1]))).toBeUndefined();
  });

  it("has nothing to ask once every place is visited, or none is named", () => {
    expect(
      placeToVisit(
        spot(),
        been("As Bifanas do Afonso", "Castelo de São Jorge"),
      ),
    ).toBeUndefined();
    expect(placeToVisit(spot({ places: [" "] }), new Set())).toBeUndefined();
    expect(
      placeToVisit(spot({ places: undefined }), new Set()),
    ).toBeUndefined();
    expect(
      placeToVisit(spot({ status: "processing" }), new Set()),
    ).toBeUndefined();
  });

  it("keeps a recipe that names its restaurant a recipe", () => {
    expect(placeToVisit(recipe({ places: ["Nonna's"] }), new Set())).toBe(
      undefined,
    );
  });

  it("gives a place a few days, then asks before the article it came in", () => {
    const fresh = spot({ _creationTime: NOW - VISIT_MIN_AGE_MS + 1 });
    const guide = article({ places: ["Time Out Market"] });
    const due = spot();
    const candidates = reminderCandidates(
      [fresh, guide, due, article()],
      NOW,
      undefined,
      new Set(),
    );
    expect(candidates.map((c) => [c.item._id, c.kind, c.subject])).toEqual([
      [due._id, "visit", "As Bifanas do Afonso"],
      [candidates[1].item._id, "read", candidates[1].subject],
    ]);
    expect(candidates[1].item._id).not.toBe(guide._id);
  });

  it("leaves a place on a trip to the trip, and an article falls back to reading", () => {
    const stop = spot();
    const visitedGuide = article({ places: ["Time Out Market"] });
    const candidates = reminderCandidates(
      [stop, visitedGuide],
      NOW,
      undefined,
      new Set([stop._id]),
      been("Time Out Market"),
    );
    expect(candidates.map((c) => [c.item._id, c.kind])).toEqual([
      [visitedGuide._id, "read"],
    ]);
  });

  it("sends the place kind to the back after a place reminder", () => {
    const [place, read, cook] = [spot(), article(), recipe()];
    const kinds = (previous?: "visit" | "read" | "cook") =>
      reminderCandidates([place, read, cook], NOW, previous, new Set()).map(
        (c) => c.kind,
      );
    expect(kinds()).toEqual(["visit", "read", "cook"]);
    expect(kinds("visit")).toEqual(["read", "cook", "visit"]);
    expect(kinds("cook")).toEqual(["visit", "read", "cook"]);
  });
});

describe("which saves get a reminder", () => {
  it("reads an article with a body", () => {
    expect(reminderKind(article())).toBe("read");
  });

  it("cooks a recipe, from a link or a screenshot", () => {
    expect(reminderKind(recipe())).toBe("cook");
    expect(reminderKind(recipe({ type: "image" }))).toBe("cook");
  });

  it("leaves alone anything it cannot name an action for", () => {
    expect(
      reminderKind(
        article({
          media: [{ kind: "video", imageUrl: "https://x", aspectRatio: 1 }],
        }),
      ),
    ).toBeUndefined();
    expect(reminderKind(article({ enrichment: "partial" }))).toBeUndefined();
    expect(reminderKind(article({ content: "  " }))).toBeUndefined();
    expect(reminderKind(item({ type: "note", content: "hi" }))).toBeUndefined();
    expect(
      reminderKind(recipe({ recipe: { ingredients: [], steps: [] } })),
    ).toBeUndefined();
    expect(reminderKind(article({ status: "processing" }))).toBeUndefined();
  });

  it("never asks to read a social post, but still cooks its recipe", () => {
    const tiktok = "https://www.tiktok.com/@lisboa/video/7300000000000000000";
    for (const url of [
      tiktok,
      "https://www.instagram.com/reel/Cabc123/",
      "https://x.com/eater/status/1",
      "https://www.pinterest.com/pin/1/",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ])
      expect(
        reminderKind(
          article({ url, content: "Best pastel de nata in Lisbon #lisbon" }),
        ),
      ).toBeUndefined();
    expect(reminderKind(recipe({ url: tiktok }))).toBe("cook");
    expect(
      reminderKind(article({ url: "https://blog.example.com/bread" })),
    ).toBe("read");
  });

  it("calls a recipe by its dish, not its page title", () => {
    expect(reminderSubject(recipe(), "cook")).toBe("Lasagna");
    expect(
      reminderSubject(
        recipe({ recipe: { ingredients: ["x"], steps: [] } }),
        "cook",
      ),
    ).toBe("The best lasagna recipe you will ever make");
    expect(reminderSubject(article({ title: "  " }), "read")).toBeUndefined();
  });
});

describe("candidate order", () => {
  it("waits a day before an article and three before a recipe", () => {
    const fresh = article({ _creationTime: NOW - READ_MIN_AGE_MS + 1 });
    const ready = article({ _creationTime: NOW - READ_MIN_AGE_MS });
    const stale = article({ _creationTime: NOW - READ_MAX_AGE_MS - 1 });
    const newRecipe = recipe({ _creationTime: NOW - COOK_MIN_AGE_MS + 1 });
    const oldRecipe = recipe({ _creationTime: NOW - 400 * DAY });
    const ids = reminderCandidates(
      [fresh, ready, newRecipe, stale, oldRecipe],
      NOW,
      undefined,
      new Set(),
    ).map((candidate) => candidate.item._id);
    expect(ids).toEqual([ready._id, oldRecipe._id]);
  });

  it("leaves an article that is a trip stop to the trip", () => {
    const [stop, unplanned] = [article(), article()];
    const ids = reminderCandidates(
      [stop, unplanned],
      NOW,
      undefined,
      new Set([stop._id]),
    ).map((candidate) => candidate.item._id);
    expect(ids).toEqual([unplanned._id]);
  });

  it("takes turns between kinds and keeps each newest first", () => {
    const [a1, a2] = [article(), article()];
    const [r1, r2] = [recipe(), recipe()];
    const order = (previous?: "read" | "cook") =>
      reminderCandidates([a1, r1, a2, r2], NOW, previous, new Set()).map(
        (candidate) => candidate.item._id,
      );
    expect(order()).toEqual([a1._id, a2._id, r1._id, r2._id]);
    expect(order("cook")).toEqual([a1._id, a2._id, r1._id, r2._id]);
    expect(order("read")).toEqual([r1._id, r2._id, a1._id, a2._id]);
  });

  it("drops an opened article for good but a recipe only for a week", () => {
    expect(openedTooRecently("read", undefined, NOW)).toBe(false);
    expect(openedTooRecently("read", NOW - 300 * DAY, NOW)).toBe(true);
    expect(openedTooRecently("cook", NOW - 6 * DAY, NOW)).toBe(true);
    expect(openedTooRecently("cook", NOW - 8 * DAY, NOW)).toBe(false);
  });
});

describe("the budget", () => {
  const opened = (createdAt: number) => ({ createdAt, opened: true });
  const ignored = (createdAt: number) => ({ createdAt, opened: false });

  it("allows a first reminder", () => {
    expect(reminderBlocked(NOW, [], [])).toBeUndefined();
  });

  it("stays clear of a weekly shelf due within the day", () => {
    const shelf = (hours: number) => ({
      nextAt: NOW + hours * 60 * 60 * 1000,
      sentThisWeek: false,
    });
    expect(reminderBlocked(NOW, [], [], shelf(15))).toBe("too_soon");
    expect(reminderBlocked(NOW, [], [], shelf(-1))).toBe("too_soon");
    expect(reminderBlocked(NOW, [], [], shelf(21))).toBeUndefined();
  });

  it("keeps a weekly slot for the shelf until it has gone out", () => {
    const three = [2, 3, 4].map((days) => NOW - days * DAY);
    const nextWeek = NOW + 3 * DAY;
    expect(
      reminderBlocked(NOW, three, [], {
        nextAt: nextWeek,
        sentThisWeek: false,
      }),
    ).toBe("weekly_limit");
    expect(
      reminderBlocked(NOW, three, [], { nextAt: nextWeek, sentThisWeek: true }),
    ).toBeUndefined();
    expect(reminderBlocked(NOW, three, [])).toBeUndefined();
  });

  it("never sends two in one day, counting the weekly shelf", () => {
    expect(reminderBlocked(NOW, [NOW - MIN_GAP_MS + 1], [])).toBe("too_soon");
    expect(reminderBlocked(NOW, [NOW - MIN_GAP_MS], [])).toBeUndefined();
  });

  it("stops at four a week", () => {
    const four = [1, 2, 3, 4].map((days) => NOW - days * DAY);
    expect(reminderBlocked(NOW, four, [])).toBe("weekly_limit");
    expect(reminderBlocked(NOW, four.slice(0, 3), [])).toBeUndefined();
    const oneAged = [...four.slice(0, 3), NOW - WEEK_MS];
    expect(reminderBlocked(NOW, oneAged, [])).toBeUndefined();
  });

  it("slows to weekly after three ignored in a row, and recovers on an open", () => {
    const last = NOW - 2 * DAY;
    const streak = [
      ignored(last),
      ignored(last - DAY),
      ignored(last - 2 * DAY),
    ];
    expect(reminderBlocked(NOW, [], streak)).toBe("ignored");
    expect(reminderBlocked(last + WEEK_MS, [], streak)).toBeUndefined();
    expect(
      reminderBlocked(NOW, [], [ignored(last), opened(last - DAY), ignored(0)]),
    ).toBeUndefined();
    expect(reminderBlocked(NOW, [], streak.slice(0, 2))).toBeUndefined();
  });
});

describe("the reminder hour", () => {
  it("uses the default until the user has saved enough", () => {
    expect(preferredReminderHour([])).toBe(DEFAULT_REMINDER_HOUR);
    expect(preferredReminderHour([12, 12, 12, 12])).toBe(DEFAULT_REMINDER_HOUR);
  });

  it("follows the hour the user saves at most", () => {
    expect(preferredReminderHour([13, 13, 13, 21, 8])).toBe(13);
  });

  it("breaks a tie toward the evening default", () => {
    expect(preferredReminderHour([11, 11, 16, 16, 9])).toBe(16);
  });

  it("keeps a night owl's or early bird's reminder in the day", () => {
    expect(preferredReminderHour([23, 23, 23, 23, 23])).toBe(19);
    expect(preferredReminderHour([6, 6, 6, 6, 6])).toBe(10);
  });
});
