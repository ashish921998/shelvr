"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { pageViewProperties } from "@/lib/pageView";

/** Sends one `$pageview` per page, so a campaign link counts its visitors,
 * not only the ones who go on to tap the App Store button. */
export default function PageViewTracker() {
  const pathname = usePathname();
  const isEntry = useRef(true);
  useEffect(() => {
    // `document.referrer` keeps the external site through client-side
    // navigation, so only the entry page reports it; later pages were linked
    // from this site.
    const referrer = isEntry.current ? document.referrer : "";
    isEntry.current = false;
    captureWebAnalyticsEvent(
      "$pageview",
      pageViewProperties(window.location, referrer),
    );
  }, [pathname]);
  return null;
}
