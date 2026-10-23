import type { Metadata } from "next";

export const SITE_TITLE = "Shelvr — save the mess, find it on a shelf";
export const SITE_DESCRIPTION =
  "Links, photos and notes, saved in a tap and filed into the right Space. No folders.";

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
