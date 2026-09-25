import { describe, expect, it } from "vitest";
import translations from "./notificationTranslations.json";
import { digestCopy, reminderCopy, truncateTitle } from "./notificationFields";

describe("digest copy", () => {
  it("names a save and counts only the others", () => {
    expect(digestCopy("en", 3, "The 12-hour short rib").body).toBe(
      "“The 12-hour short rib” and 2 more you saved this week",
    );
  });

  it("drops the count when the shelf holds only the named save", () => {
    expect(digestCopy("en", 1, "The 12-hour short rib").body).toBe(
      "“The 12-hour short rib”, saved this week",
    );
  });

  it("counts instead of naming when no save has a usable title", () => {
    expect(digestCopy("en", 3).body).toBe("3 saves waiting for you");
    expect(digestCopy("en", 3, "   ").body).toBe("3 saves waiting for you");
  });

  it("keeps the pre-locale payload for a device that never sent one", () => {
    expect(digestCopy(undefined, 2)).toEqual({
      title: "Your weekly shelf is ready",
      body: "2 saved things are waiting on your weekly shelf.",
    });
  });

  it("names the save in English for a device with no stored locale", () => {
    expect(digestCopy(undefined, 1, "A note")).toEqual({
      title: translations.en.title,
      body: "“A note”, saved this week",
    });
  });

  it("localizes the named copy", () => {
    expect(digestCopy("ja", 1, "A note").body).toBe(
      "「A note」を今週保存しました",
    );
    expect(digestCopy("fr", 2, "Une note").body).toBe(
      "« Une note » et 1 autre contenu enregistré cette semaine",
    );
  });

  it("falls back to English for a locale with no catalog", () => {
    expect(digestCopy("cy", 1, "A note").body).toBe(
      "“A note”, saved this week",
    );
  });

  // A title is user content. String replacement would expand `$&` and its
  // siblings into the surrounding copy.
  it("inserts a title containing replacement patterns literally", () => {
    expect(digestCopy("en", 1, "$& and $` and $'").body).toBe(
      "“$& and $` and $'”, saved this week",
    );
  });
});

describe("title truncation", () => {
  it("leaves a title that already fits", () => {
    expect(truncateTitle("A note")).toBe("A note");
  });

  it("trims surrounding whitespace and rejects an empty title", () => {
    expect(truncateTitle("  A note \n")).toBe("A note");
    expect(truncateTitle("   ")).toBeUndefined();
  });

  it("breaks a long title on a word boundary", () => {
    const title = `${"word ".repeat(20)}end`;
    const truncated = truncateTitle(title);
    expect(truncated).toBe(`${"word ".repeat(12).trim()}…`);
    expect(truncated?.length).toBeLessThanOrEqual(61);
  });

  it("hard-clips a long title with no late word boundary", () => {
    const truncated = truncateTitle("a".repeat(100));
    expect(truncated).toBe(`${"a".repeat(60)}…`);
  });

  it("does not leave punctuation stranded before the ellipsis", () => {
    expect(
      truncateTitle(`${"word ".repeat(11).trim()}, ${"x".repeat(40)}`),
    ).toBe(`${"word ".repeat(11).trim()}…`);
  });
});

describe("reminder copy", () => {
  it("asks about the article by name", () => {
    expect(reminderCopy("en", "read", "Why bread rises")).toEqual({
      title: "Still on your list",
      body: "You haven’t read “Why bread rises” yet.",
    });
  });

  it("offers the dish for today", () => {
    expect(reminderCopy("en", "cook", "Lasagna").body).toBe(
      "Want to make “Lasagna” today?",
    );
  });

  it("localizes, and falls back to English for a device with no locale", () => {
    expect(reminderCopy("ja", "cook", "Lasagna")).toEqual({
      title: translations.ja.reminder.cook.title,
      body: "今日は「Lasagna」を作ってみませんか？",
    });
    expect(reminderCopy(undefined, "read", "A").title).toBe(
      translations.en.reminder.read.title,
    );
  });

  it("keeps replacement patterns in a title literal and trims long ones", () => {
    expect(reminderCopy("en", "read", "Cost of $& and $`").body).toBe(
      "You haven’t read “Cost of $& and $`” yet.",
    );
    const long = reminderCopy("en", "read", "word ".repeat(30)).body;
    expect(long).toContain("…”");
  });
});
