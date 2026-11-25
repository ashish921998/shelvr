import { describe, expect, it } from "vitest";

import robots from "./robots";
import sitemap from "./sitemap";

describe("sitemap and robots", () => {
  it("lists the public pages and none of the private links", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://tryshelvr.app");
    expect(urls).toContain("https://tryshelvr.app/date-night-planner");
    expect(urls).toContain("https://tryshelvr.app/trip-planner");
    expect(urls).toContain("https://tryshelvr.app/save-places-from-reels");
    expect(urls).toContain("https://tryshelvr.app/privacy");
    expect(urls).toContain("https://tryshelvr.app/copyright");
    expect(
      urls.some((url) => /\/(i|p|l|m|api|auth|waitlist)\//.test(url)),
    ).toBe(false);
  });

  it("points crawlers at the sitemap and keeps them out of the API", () => {
    expect(robots()).toMatchObject({
      rules: { disallow: "/api/" },
      sitemap: "https://tryshelvr.app/sitemap.xml",
    });
  });
});
