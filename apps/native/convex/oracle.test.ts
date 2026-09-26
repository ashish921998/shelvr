import { describe, expect, it } from "vitest";
import { parseOracleInput } from "./model/oracle";
import { oraclePrompt } from "./oracle";

const library = {
  kind: "library",
  rows: [
    {
      label: "Sourdough starter guide",
      domain: "kingarthur.com",
      savedAt: Date.UTC(2019, 2, 4),
    },
    { label: "https://example.com/a", domain: "example.com" },
  ],
  stats: {
    count: 412,
    oldestAt: Date.UTC(2014, 0, 2),
    topDomains: ["kingarthur.com"],
  },
};

describe("parseOracleInput", () => {
  it.each([
    { kind: "links", urls: ["https://example.com/a", "https://example.com/b"] },
    { kind: "screenshot", imageBase64: "aGVsbG8=", mediaType: "image/png" },
    { kind: "tabs", count: 47, titles: ["Flights to Lisbon", "Inbox (3)"] },
    { kind: "tabs", count: 3, titles: [] },
    library,
  ])("accepts a valid $kind body unchanged", (body) => {
    expect(parseOracleInput(body)).toEqual(body);
  });

  it("drops fields the kind does not declare", () => {
    expect(
      parseOracleInput({ kind: "tabs", count: 2, titles: [], extra: true }),
    ).toEqual({ kind: "tabs", count: 2, titles: [] });
  });

  it("rejects a fourth url", () => {
    const urls = ["a", "b", "c", "d"].map((p) => `https://example.com/${p}`);
    expect(parseOracleInput({ kind: "links", urls })).toBeUndefined();
  });

  it("rejects a url that is not https", () => {
    expect(
      parseOracleInput({ kind: "links", urls: ["http://example.com"] }),
    ).toBeUndefined();
  });

  it("rejects an unknown kind", () => {
    expect(
      parseOracleInput({ kind: "horoscope", sign: "leo" }),
    ).toBeUndefined();
  });

  it("rejects a sixth tab title and a 41st library row", () => {
    const titles = Array.from({ length: 6 }, (_, i) => `Tab ${i}`);
    expect(
      parseOracleInput({ kind: "tabs", count: 6, titles }),
    ).toBeUndefined();
    const rows = Array.from({ length: 41 }, () => library.rows[1]);
    expect(parseOracleInput({ ...library, rows })).toBeUndefined();
  });

  it.each([
    ["before 1990", Date.UTC(1989, 11, 31)],
    ["after 2100", Date.UTC(2100, 0, 2)],
    ["outside JavaScript's date range", 1e20],
  ])("rejects a save dated %s", (_, savedAt) => {
    const row = { ...library.rows[0], savedAt };
    expect(parseOracleInput({ ...library, rows: [row] })).toBeUndefined();
    const stats = { ...library.stats, oldestAt: savedAt };
    expect(parseOracleInput({ ...library, stats })).toBeUndefined();
  });

  it("rejects an image over the size cap or outside base64", () => {
    const huge = "A".repeat(4 * 1024 * 1024 + 4);
    const image = { kind: "screenshot", mediaType: "image/jpeg" };
    expect(parseOracleInput({ ...image, imageBase64: huge })).toBeUndefined();
    expect(parseOracleInput({ ...image, imageBase64: "no!" })).toBeUndefined();
  });
});

describe("oraclePrompt", () => {
  it("carries each link, its page text, and flags an unread page", () => {
    const prompt = oraclePrompt(
      {
        kind: "links",
        urls: ["https://a.example/pasta", "https://b.example/x"],
      },
      [{ title: "Cacio e Pepe", excerpt: "Toast the pepper first." }],
    );
    expect(prompt).toContain("https://a.example/pasta");
    expect(prompt).toContain("Cacio e Pepe");
    expect(prompt).toContain("Toast the pepper first.");
    expect(prompt).toContain("https://b.example/x");
    expect(prompt).toContain("could not be read");
  });

  it("points a screenshot prompt at the attached image", () => {
    const prompt = oraclePrompt({
      kind: "screenshot",
      imageBase64: "aGVsbG8=",
      mediaType: "image/png",
    });
    expect(prompt).toContain("screenshot is attached");
    expect(prompt).not.toContain("aGVsbG8=");
  });

  it("carries the tab count and every title", () => {
    const prompt = oraclePrompt({
      kind: "tabs",
      count: 83,
      titles: ["Flights to Lisbon", "How to quit your job"],
    });
    expect(prompt).toContain("Open tabs: 83");
    expect(prompt).toContain("- Flights to Lisbon");
    expect(prompt).toContain("- How to quit your job");
  });

  it("carries the library stats and sampled rows", () => {
    const prompt = oraclePrompt({
      kind: "library",
      rows: [
        {
          label: "Sourdough starter guide",
          domain: "kingarthur.com",
          savedAt: Date.UTC(2019, 2, 4),
        },
      ],
      stats: {
        count: 412,
        oldestAt: Date.UTC(2014, 0, 2),
        topDomains: ["youtube.com", "kingarthur.com"],
      },
    });
    expect(prompt).toContain("Total saves: 412");
    expect(prompt).toContain("Oldest save: 2014-01-02");
    expect(prompt).toContain("youtube.com, kingarthur.com");
    expect(prompt).toContain(
      "- Sourdough starter guide (kingarthur.com, saved 2019-03-04)",
    );
  });
});
