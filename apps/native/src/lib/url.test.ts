import { describe, expect, it } from "vitest";

import { displayHost, extractFirstUrl, isProbablyUrl } from "./url";

describe("isProbablyUrl", () => {
  it("recognizes a URL with and without an https scheme", () => {
    expect(isProbablyUrl("https://example.com")).toBe(true);
    expect(isProbablyUrl("example.com")).toBe(true);
  });

  it("rejects internal whitespace even when the trimmed value looks like a host", () => {
    expect(isProbablyUrl("example.com some words")).toBe(false);
  });
});

describe("extractFirstUrl", () => {
  it("pulls the URL out of caption text", () => {
    expect(extractFirstUrl("Check out this video! https://tiktok.com/@a/video/1")).toBe(
      "https://tiktok.com/@a/video/1",
    );
  });

  it("keeps a closing paren the URL itself opened", () => {
    expect(
      extractFirstUrl("read this https://en.wikipedia.org/wiki/Function_(mathematics)"),
    ).toBe("https://en.wikipedia.org/wiki/Function_(mathematics)");
  });

  it("strips a closing paren borrowed from the surrounding text", () => {
    expect(extractFirstUrl("see the docs (https://example.com/a)")).toBe(
      "https://example.com/a",
    );
  });

  it("strips sentence punctuation after a balanced paren", () => {
    expect(
      extractFirstUrl("go to https://en.wikipedia.org/wiki/Function_(mathematics)."),
    ).toBe("https://en.wikipedia.org/wiki/Function_(mathematics)");
  });

  it("returns null when the text has no http(s) URL", () => {
    expect(extractFirstUrl("just a note about example.com")).toBeNull();
  });
});

describe("displayHost", () => {
  it("strips the scheme and leading www", () => {
    expect(displayHost("https://www.example.com/path?q=1")).toBe("example.com");
  });

  it("falls back to the raw input when it cannot be parsed as a URL", () => {
    expect(displayHost("not a url")).toBe("not a url");
  });

  it("returns an empty string for undefined input", () => {
    expect(displayHost(undefined)).toBe("");
  });
});
