import type { MetadataRoute } from "next";

const SITE = "https://shelvr-web.vercel.app";

// Public, indexable pages only. Share pages, auth and waitlist confirmations
// are noindex and stay out.
const PAGES = [
  { path: "/", priority: 1 },
  { path: "/instagram-saved-posts-viewer", priority: 0.8 },
  { path: "/oracle", priority: 0.6 },
  { path: "/support", priority: 0.3 },
  { path: "/privacy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((page) => ({
    url: `${SITE}${page.path}`,
    changeFrequency: "monthly",
    priority: page.priority,
  }));
}
