import { describe, expect, it } from "vitest";

import { extractCanonical, extractMetaContent } from "./pageReadCore";

describe("extractMetaContent", () => {
  it("keeps an apostrophe inside a double-quoted value", () => {
    const html = `<meta property="og:site_name" content="Sally's Baking Addiction">`;
    expect(extractMetaContent(html, "og:site_name")).toBe(
      "Sally's Baking Addiction",
    );
  });

  it("keeps double quotes inside a single-quoted value", () => {
    const html = `<meta content='The "best" cookies' name='description'>`;
    expect(extractMetaContent(html, "description")).toBe('The "best" cookies');
  });

  it("reads plain values in either attribute order and decodes entities", () => {
    expect(
      extractMetaContent(
        `<meta name="og:title" content="Grandma&#39;s cookies">`,
        "og:title",
      ),
    ).toBe("Grandma's cookies");
    expect(
      extractMetaContent(
        `<meta content="Dal" property="og:title" />`,
        "og:title",
      ),
    ).toBe("Dal");
  });

  it("skips a blank value", () => {
    expect(
      extractMetaContent(`<meta property="og:title" content="  ">`, "og:title"),
    ).toBeUndefined();
  });
});

describe("extractCanonical", () => {
  it("reads a single-quoted href", () => {
    expect(
      extractCanonical(`<link rel='canonical' href='https://a.example/x'>`),
    ).toBe("https://a.example/x");
  });

  it("keeps a URL with an apostrophe in a double-quoted href", () => {
    expect(
      extractCanonical(
        `<link rel="canonical" href="https://a.example/joe's-dal">`,
      ),
    ).toBe("https://a.example/joe's-dal");
  });
});
