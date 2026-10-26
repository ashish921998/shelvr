import type { Metadata } from "next";
import { headers } from "next/headers";

import BioLink from "@/components/BioLink";
import { inAppBrowser, platform } from "@/lib/bioLink";

export const metadata: Metadata = {
  title: "Get Shelvr",
  description:
    "Save food and travel finds from any video. Shelvr pins them and plans the day.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/get" },
};

export default async function GetPage() {
  const userAgent = (await headers()).get("user-agent") ?? "";
  return (
    <BioLink inApp={inAppBrowser(userAgent)} platform={platform(userAgent)} />
  );
}
