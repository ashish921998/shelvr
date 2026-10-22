import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { stripTags } from "./pageReadCore";

const markup = fc
  .array(
    fc.constantFrom("<", ">", "a", "/", " ", "<script>", "script", "&lt;"),
    { maxLength: 40 },
  )
  .map((parts) => parts.join(""));

const text = fc.string().filter((value) => !/[<>]/.test(value));
const tagBody = fc
  .string({ minLength: 1 })
  .filter((value) => !value.includes(">"));

describe("stripTags", () => {
  it("keeps the text between tags and drops every tag", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(text, tagBody), { maxLength: 8 }),
        text,
        (pieces, tail) => {
          const html =
            pieces.map(([before, body]) => `${before}<${body}>`).join("") +
            tail;
          const expected = pieces.map(([before]) => before).join("") + tail;
          expect(stripTags(html)).toBe(expected);
        },
      ),
    );
  });

  it("never leaves an angle bracket that opens a tag", () => {
    fc.assert(
      fc.property(markup, (html) => {
        expect(stripTags(html)).not.toContain("<");
      }),
    );
  });

  it("drops an angle bracket that opens nothing and keeps a stray closing one", () => {
    expect(stripTags("a<b")).toBe("ab");
    expect(stripTags("<>a")).toBe(">a");
    expect(stripTags("x<a>y<z<w")).toBe("xyzw");
  });

  it("takes linear time on a long run of angle brackets that open nothing", () => {
    const started = performance.now();
    expect(stripTags("<".repeat(1_000_000))).toBe("");
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("cannot be rebuilt into a script tag by nesting tags", () => {
    expect(stripTags("<<b>script>alert(1)<</b>/script>")).toBe(
      "script>alert(1)/script>",
    );
  });
});
