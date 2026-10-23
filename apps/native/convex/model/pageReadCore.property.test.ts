import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  extractCanonical,
  extractMetaContent,
  extractTitle,
  stripTags,
} from "./pageReadCore";

const SIZES = [16, 64, 256, 1024].map((kilobytes) => kilobytes * 1024);

function pageOf(unit: string, size: number): string {
  return unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
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

  it("reads the first of two attributes with the same name", () => {
    const html = `<meta name="description" name="og:title" content="Dal">`;
    expect(extractMetaContent(html, "description")).toBe("Dal");
    expect(extractMetaContent(html, "og:title")).toBeUndefined();
  });

  it("does not read a tag written inside a quoted value", () => {
    const html = `<meta name="description" content="Add <meta property='og:title' content='X'> tags">`;
    expect(extractMetaContent(html, "og:title")).toBeUndefined();
    expect(extractMetaContent(html, "description")).toBe(
      "Add <meta property='og:title' content='X'> tags",
    );
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

  it("keeps reading after a canonical link whose href is an encoded space", () => {
    expect(
      extractCanonical(
        `<link rel="canonical" href="&#32;"><link rel="canonical" href="https://a.example/x">`,
      ),
    ).toBe("https://a.example/x");
  });

  it("keeps reading after a canonical link whose href is blank", () => {
    expect(
      extractCanonical(
        `<link rel="canonical" href=" "><link rel="canonical" href="https://a.example/x">`,
      ),
    ).toBe("https://a.example/x");
  });

  it("reads the first of two attributes with the same name", () => {
    expect(
      extractCanonical(
        `<link rel="canonical" href="https://a.example/x" rel="nofollow">`,
      ),
    ).toBe("https://a.example/x");
    expect(
      extractCanonical(
        `<link rel="canonical" href="https://a.example/x" href="">`,
      ),
    ).toBe("https://a.example/x");
  });
});

describe("extractTitle", () => {
  it("skips an og:title that is only an encoded space", () => {
    expect(
      extractTitle(
        `<meta property="og:title" content="&#32;&nbsp;"><title>Dal</title>`,
      ),
    ).toBe("Dal");
  });

  it("reads the first title element in any case, up to its first closing tag", () => {
    expect(
      extractTitle("<TITLE lang='en'>Dal\n  makhani</Title><p>x</p></title>"),
    ).toBe("Dal makhani");
  });
});

describe("page reading on up to a megabyte of tags that never close", () => {
  it.each([
    '<meta name="og:title" ',
    "<meta ",
    '<meta content="',
    '<link rel="canonical" ',
    "<link ",
  ])("reads meta and canonical tags from %j in under a second", (unit) => {
    for (const size of SIZES) {
      const html = pageOf(unit, size);
      const started = performance.now();
      expect(extractMetaContent(html, "og:title")).toBeUndefined();
      expect(extractCanonical(html)).toBeUndefined();
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });

  it.each(["<title>", "<title "])(
    "reads the title from %j in under a second",
    (unit) => {
      for (const size of SIZES) {
        const html = pageOf(unit, size);
        const started = performance.now();
        expect(extractTitle(html)).toBeUndefined();
        expect(performance.now() - started).toBeLessThan(1000);
      }
    },
  );
});
