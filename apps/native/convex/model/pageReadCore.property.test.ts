import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { stripTags } from "./pageReadCore";

const markup = fc
  .array(
    fc.constantFrom("<", ">", "a", "/", " ", "<script>", "script", "&lt;"),
    { maxLength: 40 },
  )
  .map((parts) => parts.join(""));

const regexPair = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/</g, "");

describe("stripTags", () => {
  it("matches the pair of regexes it replaced", () => {
    fc.assert(
      fc.property(markup, (html) => {
        expect(stripTags(html)).toBe(regexPair(html));
      }),
    );
  });

  it("never leaves an angle bracket that opens a tag", () => {
    fc.assert(
      fc.property(markup, (html) => {
        expect(stripTags(html)).not.toContain("<");
      }),
    );
  });

  it("cannot be rebuilt into a script tag by nesting tags", () => {
    expect(stripTags("<<b>script>alert(1)<</b>/script>")).toBe(
      "script>alert(1)/script>",
    );
  });
});
