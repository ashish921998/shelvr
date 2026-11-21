import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/siteMetadata";
import { ALTERNATIVES, alternativePath, HUB_PATH } from "@/lib/alternatives";
import { GUIDES } from "@/lib/guides";

// Only the public pages people should land on; shares, votes and flows stay out.
const PAGES = [
  "/",
  "/oracle",
  "/reel-place-finder",
  ...GUIDES.map((page) => page.path),
  HUB_PATH,
  ...ALTERNATIVES.map(alternativePath),
  "/support",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
  }));
}
