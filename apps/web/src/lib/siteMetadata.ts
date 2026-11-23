import type { Metadata } from "next";

import { APP_STORE_ID } from "@/lib/appStore";

export const SITE_ORIGIN = "https://tryshelvr.app";
export const SITE_NAME = "Shelvr";
export const SITE_TITLE = "Shelvr — saved it, now go there";
export const SITE_DESCRIPTION =
  "Share a reel or TikTok to Shelvr. The places in it land on a map of their city, ready for a date night or a trip.";

export const SITE_METADATA: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  itunes: { appId: APP_STORE_ID },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

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
      siteName: SITE_NAME,
      type: "website",
    },
  };
}
