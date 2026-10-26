import type { MetadataRoute } from "next";

const SITE = "https://shelvr-web.vercel.app";

// Only the public pages people should land on; shares, votes and flows stay out.
const PAGES = [
  "/",
  "/oracle",
  "/instagram-saved-posts-viewer",
  "/support",
  "/privacy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({ url: `${SITE}${path === "/" ? "" : path}` }));
}
