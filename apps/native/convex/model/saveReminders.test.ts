import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  COOK_MIN_AGE_MS,
  DEFAULT_REMINDER_HOUR,
  MIN_GAP_MS,
  READ_MAX_AGE_MS,
  READ_MIN_AGE_MS,
  WEEK_MS,
  openedTooRecently,
  preferredReminderHour,
  reminderBlocked,
  reminderCandidates,
  reminderKind,
  reminderSubject,
} from "./saveReminders";

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

describe("which saves get a reminder", () => {
  it("reads an article with a body", () => {
    expect(reminderKind(article())).toBe("read");
  });

  it("cooks a recipe, from a link or a screenshot", () => {
    expect(reminderKind(recipe())).toBe("cook");
    expect(reminderKind(recipe({ type: "image" }))).toBe("cook");
  });

  it("leaves alone anything it cannot name an action for", () => {
    // A social post, a page it could not read, a page with no body, a note.
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
    ).map((candidate) => candidate.item._id);
    expect(ids).toEqual([ready._id, oldRecipe._id]);
  });

  it("takes turns between kinds and keeps each newest first", () => {
    const [a1, a2] = [article(), article()];
    const [r1, r2] = [recipe(), recipe()];
    const order = (previous?: "read" | "cook") =>
      reminderCandidates([a1, r1, a2, r2], NOW, previous).map(
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
