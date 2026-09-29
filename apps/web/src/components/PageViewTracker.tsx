"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { pageViewProperties } from "@/lib/pageView";

/** Sends one `$pageview` per page, so a campaign link counts its visitors,
 * not only the ones who go on to tap the App Store button. */
export default function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    captureWebAnalyticsEvent(
      "$pageview",
      pageViewProperties(window.location, document.referrer),
    );
  }, [pathname]);
  return null;
}
