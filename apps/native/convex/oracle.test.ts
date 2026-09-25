import { describe, expect, it } from "vitest";
import { parseOracleInput } from "./model/oracle";

const library = {
  kind: "library",
  rows: [
    { label: "Sourdough starter guide", domain: "kingarthur.com", savedAt: 1 },
    { label: "https://example.com/a", domain: "example.com" },
  ],
  stats: { count: 412, oldestAt: 1, topDomains: ["kingarthur.com"] },
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

  it("rejects an image over the size cap or outside base64", () => {
    const huge = "A".repeat(4 * 1024 * 1024 + 4);
    const image = { kind: "screenshot", mediaType: "image/jpeg" };
    expect(parseOracleInput({ ...image, imageBase64: huge })).toBeUndefined();
    expect(parseOracleInput({ ...image, imageBase64: "no!" })).toBeUndefined();
  });
});
