"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useRef } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import {
  pageLeaveProperties,
  pageViewProperties,
  webVitalProperties,
} from "@/lib/pageView";

function reportWebVital(metric: { name: string; value: number }) {
  const properties = webVitalProperties(metric, window.location.pathname);
  if (properties) captureWebAnalyticsEvent("$web_vitals", properties);
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const isEntry = useRef(true);
  useReportWebVitals(reportWebVital);
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
    const viewedAt = Date.now();
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      captureWebAnalyticsEvent(
        "$pageleave",
        pageLeaveProperties(pathname, viewedAt),
        { pathname },
      );
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [pathname]);
  return null;
}
