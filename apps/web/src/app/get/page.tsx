import type { Metadata } from "next";
import { headers } from "next/headers";

import BioLink from "@/components/BioLink";
import { inAppBrowser, platform } from "@/lib/bioLink";

export const metadata: Metadata = {
  title: "Get Shelvr",
  description:
    "Save food and travel finds from any video. Shelvr pins them and plans the day.",
  // The bio link is for people arriving from a profile, not search results.
  robots: { index: false, follow: false },
  alternates: { canonical: "/get" },
};

/** The link in each social account's bio: `/get?ct=<account>`. The user agent
 * is read on the server, so an in-app browser shows its overlay on the first
 * paint instead of flashing the download page. */
export default async function GetPage() {
  const userAgent = (await headers()).get("user-agent") ?? "";
  return (
    <BioLink inApp={inAppBrowser(userAgent)} platform={platform(userAgent)} />
  );
}
