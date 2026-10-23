import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
  extractCanonical,
  extractMetaContent,
  fetchPage,
  stripTags,
} from "./pageReadCore";

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("./safeFetch", async (original) => ({
  ...(await original<typeof import("./safeFetch")>()),
  safeFetch,
}));

const MEGABYTE = 1024 * 1024;

function megabyteOf(unit: string): string {
  return unit.repeat(Math.ceil(MEGABYTE / unit.length)).slice(0, MEGABYTE);
}

const KEYS = ["og:title", "description", "og:image"];

const valueText = fc
  .array(fc.constantFrom("a", "Z", " ", "\n", "'", ">", "/", "=", "<meta "), {
    maxLength: 6,
  })
  .map((parts) => parts.join(""));

function quoted(value: string): string {
  return value.includes("'") ? `"${value}"` : `'${value}'`;
}

const metaTag = fc
  .record({
    keyAttribute: fc.constantFrom("property", "name", "PROPERTY", "Name"),
    key: fc.constantFrom(...KEYS),
    upperKey: fc.boolean(),
    content: valueText,
    contentFirst: fc.boolean(),
    note: fc.option(valueText),
    selfClosing: fc.boolean(),
  })
  .map((tag) => {
    const key = tag.upperKey ? tag.key.toUpperCase() : tag.key;
    const attributes = [
      `${tag.keyAttribute}=${quoted(key)}`,
      `content=${quoted(tag.content)}`,
    ];
    if (tag.contentFirst) attributes.reverse();
    if (tag.note !== null) attributes.unshift(`data-note=${quoted(tag.note)}`);
    const html = `<meta ${attributes.join(" ")}${tag.selfClosing ? " /" : ""}>`;
    return { key: tag.key, content: tag.content, html };
  });

const filler = fc.constantFrom(
  "",
  "\n",
  " > ",
  "<p>text</p>",
  "<div class='x'>",
  '<link rel="stylesheet" href="a.css">',
);

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

describe("extractMetaContent", () => {
  it("returns the first tag in page order that names the key and has content", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(filler, metaTag)), (page) => {
        const html = page.map(([before, tag]) => before + tag.html).join("");
        for (const key of KEYS) {
          const expected = page
            .map(([, tag]) => tag)
            .find((tag) => tag.key === key && tag.content.trim() !== "")
            ?.content.trim();
          expect(extractMetaContent(html, key)).toBe(expected);
        }
      }),
    );
  });

  it("keeps reading after a tag whose content is blank", () => {
    const html = `<meta property="og:title" content=" "><meta name="og:title" content="Dal">`;
    expect(extractMetaContent(html, "og:title")).toBe("Dal");
  });

  it("ignores a tag the page ends inside", () => {
    const html = `<meta property="og:title" content="Dal"><meta name="description" content="Cut`;
    expect(extractMetaContent(html, "og:title")).toBe("Dal");
    expect(extractMetaContent(html, "description")).toBeUndefined();
  });
});

describe("extractCanonical", () => {
  it("matches the tag, its attributes and rel in any case", () => {
    expect(
      extractCanonical(`<LINK REL="Canonical" HREF="https://a.example/x">`),
    ).toBe("https://a.example/x");
  });

  it("keeps a > inside a quoted value from ending the tag", () => {
    expect(
      extractCanonical(
        `<link title="a > b" rel="canonical" href="https://a.example/x">`,
      ),
    ).toBe("https://a.example/x");
  });
});

describe("page reading on a megabyte of tags that never close", () => {
  it.each([
    '<meta name="og:title" ',
    "<meta ",
    '<meta content="',
    '<link rel="canonical" ',
    "<link ",
  ])("reads meta and canonical tags from %j in linear time", (unit) => {
    const html = megabyteOf(unit);
    const started = performance.now();
    expect(extractMetaContent(html, "og:title")).toBeUndefined();
    expect(extractCanonical(html)).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it.each(["<title>", "<title "])(
    "reads the title from %j in linear time",
    async (unit) => {
      safeFetch.mockResolvedValueOnce({
        ok: true,
        bytes: new TextEncoder().encode(megabyteOf(unit)),
        contentType: "text/html",
        finalUrl: "https://a.example/",
      });
      const started = performance.now();
      const page = await fetchPage("https://a.example/");
      expect(performance.now() - started).toBeLessThan(1000);
      expect(page.title).toBeUndefined();
    },
  );
});
