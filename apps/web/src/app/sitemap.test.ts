import { describe, expect, it } from "vitest";

import robots from "./robots";
import sitemap from "./sitemap";

describe("sitemap and robots", () => {
  it("lists the public pages and none of the private links", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://shelvr-web.vercel.app");
    expect(urls).toContain("https://shelvr-web.vercel.app/privacy");
    expect(urls.some((url) => /\/(i|p|api|auth|waitlist)\//.test(url))).toBe(
      false,
    );
  });

  it("points crawlers at the sitemap and keeps them out of the API", () => {
    expect(robots()).toMatchObject({
      rules: { disallow: "/api/" },
      sitemap: "https://shelvr-web.vercel.app/sitemap.xml",
    });
  });
});
