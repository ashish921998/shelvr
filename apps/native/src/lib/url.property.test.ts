import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { extractFirstUrl, isProbablyUrl } from "./url";

/** A link that ends in a character no sentence borrows, so the whole of it
 * is the link. */
const link = fc
  .webUrl({ withQueryParameters: true, withFragments: true })
  .filter((url) => /[A-Za-z0-9/]$/.test(url));

/** What a share sheet puts before the link: any text with no link of its own. */
const caption = fc.string().filter((text) => !/https?:\/\//i.test(text));

describe("extractFirstUrl", () => {
  it("finds the link inside a shared caption and drops the sentence around it", () => {
    fc.assert(
      fc.property(
        caption,
        link,
        fc
          .array(fc.constantFrom(".", ",", ";", ":", "!", "?", "'", '"'), {
            maxLength: 3,
          })
          .map((marks) => marks.join("")),
        fc.string(),
        (before, url, punctuation, after) => {
          expect(extractFirstUrl(`${before} ${url}${punctuation}`)).toBe(url);
          expect(
            extractFirstUrl(`${before}\n${url}${punctuation} ${after}`),
          ).toBe(url);
          // A caption that wraps the link in brackets keeps its own bracket.
          // A link with brackets of its own is a guess either way.
          if (!/[()]/.test(url)) {
            expect(extractFirstUrl(`${before} (${url})${punctuation}`)).toBe(
              url,
            );
          }
        },
      ),
    );
  });

  it("only ever returns an http(s) link that is in the text", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.tuple(fc.string(), link, fc.string()).map((p) => p.join("")),
        ),
        (text) => {
          const url = extractFirstUrl(text);
          if (url === null) {
            expect(text).not.toMatch(/https?:\/\/[^\s<>"]/i);
            return;
          }
          expect(text).toContain(url);
          expect(url).toMatch(/^https?:\/\//i);
          expect(url).not.toMatch(/[\s<>"]/);
          // Trimming is finished: extracting from the result changes nothing.
          expect(extractFirstUrl(url)).toBe(url);
        },
      ),
    );
  });
});

describe("isProbablyUrl", () => {
  it("accepts a bare domain or link, with or without a scheme", () => {
    fc.assert(
      fc.property(
        fc.domain(),
        fc.constantFrom("", "https://", "http://", "HTTPS://"),
        fc.constantFrom("", "/", "/a/b?c=d#e"),
        (domain, scheme, path) => {
          expect(isProbablyUrl(`  ${scheme}${domain}${path} `)).toBe(true);
        },
      ),
    );
  });

  it("never takes text with a space in it for a link", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        fc.pre(a.trim() !== "" && b.trim() !== "");
        expect(isProbablyUrl(`${a} ${b}`)).toBe(false);
      }),
    );
  });
});
