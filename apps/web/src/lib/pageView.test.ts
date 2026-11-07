// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  pageLeaveProperties,
  pageViewProperties,
  referringDomain,
  webVitalProperties,
} from "./pageView";

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

  it("never sends a plan vote token", () => {
    const properties = pageViewProperties(
      { origin, pathname: "/p/plan_secret456", search: "" },
      "",
    );
    expect(properties.$current_url).toBe(`${origin}/p/[token]`);
    expect(JSON.stringify(properties)).not.toContain("plan_secret456");
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

describe("page leave properties", () => {
  it("names the redacted page and how long it was open", () => {
    expect(pageLeaveProperties("/i/secret", 1_000, 13_500)).toEqual({
      $pathname: "/i/[token]",
      $prev_pageview_pathname: "/i/[token]",
      $prev_pageview_duration: 12.5,
    });
  });
});

describe("web vital properties", () => {
  it("uses PostHog's property name for the metric", () => {
    expect(webVitalProperties({ name: "LCP", value: 1234 }, "/p/x")).toEqual({
      $pathname: "/p/[token]",
      $web_vitals_LCP_value: 1234,
    });
  });

  it("skips metrics PostHog does not chart", () => {
    expect(webVitalProperties({ name: "TTFB", value: 80 }, "/")).toBeNull();
  });
});
