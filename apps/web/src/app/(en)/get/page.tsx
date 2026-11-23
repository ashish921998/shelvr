import type { Metadata } from "next";
import { headers } from "next/headers";

import BioLink from "@/components/BioLink";
import { inAppBrowser, platform } from "@/lib/bioLink";

export const metadata: Metadata = {
  title: "Get Shelvr",
  description:
    "Share a reel or TikTok to Shelvr. Its places land on a map of their city, ready for a date night or a trip.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/get" },
};

export default async function GetPage() {
  const userAgent = (await headers()).get("user-agent") ?? "";
  return (
    <BioLink inApp={inAppBrowser(userAgent)} platform={platform(userAgent)} />
  );
}
