"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { pageViewProperties } from "@/lib/pageView";

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
