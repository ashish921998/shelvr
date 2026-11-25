import type { MetadataRoute } from "next";

import { ALTERNATIVES, alternativePath, HUB_PATH } from "@/lib/alternatives";
import { LANDINGS } from "@/lib/localizedLanding";
import { SITE_ORIGIN } from "@/lib/siteMetadata";

// Only the public pages people should land on; shares, votes and flows stay out.
const PAGES = [
  "/",
  ...LANDINGS.map((page) => page.path),
  "/date-night-planner",
  "/trip-planner",
  "/save-places-from-reels",
  HUB_PATH,
  ...ALTERNATIVES.map(alternativePath),
  "/oracle",
  "/reel-place-finder",
  "/support",
  "/privacy",
  "/terms",
  "/copyright",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({
    url: `${SITE_ORIGIN}${path === "/" ? "" : path}`,
  }));
}
