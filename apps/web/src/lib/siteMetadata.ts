import type { Metadata } from "next";

export const SITE_TITLE = "Shelvr — saved it, now go there";
export const SITE_DESCRIPTION =
  "Share a reel or TikTok to Shelvr. The places in it land on a map of their city, ready for a date night or a trip.";

/**
 * A page's metadata with its own canonical and og:url. The root layout leaves
 * these out, because a child page that sets no `alternates` or `openGraph`
 * inherits the layout's, and would name the homepage as its canonical.
 */
export function pageMetadata(
  path: string,
  title: string,
  description: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "Shelvr",
      type: "website",
    },
  };
}
