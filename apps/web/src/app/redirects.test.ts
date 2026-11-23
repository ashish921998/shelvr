import { describe, expect, it } from "vitest";

import { ALTERNATIVES, alternativePath, HUB_PATH } from "@/lib/alternatives";
import { APP_LINK_ORIGIN } from "@/lib/appLinkOrigin";
import { LANDINGS } from "@/lib/localizedLanding";
import { SITE_ORIGIN } from "@/lib/siteMetadata";

import nextConfig from "../../next.config";
import sitemap from "./sitemap";

describe("legacy marketing URLs", () => {
  it("redirects the public acquisition pages one to one", async () => {
    const paths = [
      "/",
      ...LANDINGS.map(({ path }) => path),
      "/reel-place-finder",
      "/save-places-from-reels",
      "/date-night-planner",
      "/trip-planner",
      HUB_PATH,
      ...ALTERNATIVES.map(alternativePath),
    ];
    const published = new Set(
      sitemap().map(({ url }) => new URL(url).pathname),
    );
    const redirects = (await nextConfig.redirects?.()) ?? [];

    expect(redirects.map(({ source }) => source).sort()).toEqual(paths.sort());
    for (const redirect of redirects) {
      expect(published.has(redirect.source)).toBe(true);
      expect(redirect.destination).toBe(
        new URL(redirect.source, SITE_ORIGIN).href,
      );
      expect(redirect.permanent).toBe(true);
    }
  });

  it("matches the legacy hostname exactly", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.length).toBeGreaterThan(0);
    for (const { has } of redirects) {
      expect(has).toHaveLength(1);
      expect(has?.[0]?.type).toBe("host");
      const host = new RegExp(`^(?:${has?.[0]?.value})$`);
      expect(host.test(new URL(APP_LINK_ORIGIN).hostname)).toBe(true);
      expect(host.test(new URL(SITE_ORIGIN).hostname)).toBe(false);
      expect(host.test("shelvr-webXvercelYapp")).toBe(false);
      expect(host.test("shelvr-web.vercel.app.example")).toBe(false);
    }
  });
});
