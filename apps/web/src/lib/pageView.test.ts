// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { pageViewProperties, referringDomain } from "./pageView";

const origin = "https://shelvr-web.vercel.app";

describe("page view properties", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("carries the campaign and the referring host, not the query", () => {
    expect(
      pageViewProperties(
        { origin, pathname: "/", search: "?ct=reddit&x=1" },
        "https://www.reddit.com/r/apps/comments/abc/some_post/",
      ),
    ).toEqual({
      $current_url: `${origin}/`,
      $pathname: "/",
      $referring_domain: "www.reddit.com",
      campaign: "reddit",
    });
  });

  it("keeps the arrival campaign for later pages in the session", () => {
    pageViewProperties({ origin, pathname: "/", search: "?ct=reddit" }, "");
    expect(
      pageViewProperties(
        { origin, pathname: "/oracle", search: "?c=secret-verdict" },
        `${origin}/`,
      ),
    ).toEqual({
      $current_url: `${origin}/oracle`,
      $pathname: "/oracle",
      $referring_domain: "$direct",
      campaign: "reddit",
    });
  });

  it("never sends a share token", () => {
    const properties = pageViewProperties(
      { origin, pathname: "/i/tok_secret123", search: "" },
      "",
    );
    expect(properties.$current_url).toBe(`${origin}/i/[token]`);
    expect(JSON.stringify(properties)).not.toContain("tok_secret123");
  });

  it("omits the campaign when the visitor brought none", () => {
    expect(
      pageViewProperties({ origin, pathname: "/", search: "" }, ""),
    ).not.toHaveProperty("campaign");
  });

  it("reads an unusable referrer as direct", () => {
    expect(referringDomain("", origin)).toBe("$direct");
    expect(referringDomain("not a url", origin)).toBe("$direct");
  });
});
