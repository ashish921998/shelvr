"use client";

import { useEffect } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { arrivalCampaign } from "@/lib/appStore";
import type { OracleMode } from "@/lib/oracle";

/** Counts one view of a shared verdict and, unless the visitor arrived with a
 * campaign of their own, credits the rest of the visit to `oracle_share`.
 * Render it before the page's App Store link, so this effect runs first. */
export default function SharedVerdictView({ mode }: { mode: OracleMode }) {
  useEffect(() => {
    if (!arrivalCampaign(window.location.search)) {
      arrivalCampaign("?ct=oracle_share");
    }
    // The verdict's text rides in `?c=`, so the event keeps the path only.
    captureWebAnalyticsEvent("oracle_share_viewed", {
      mode,
      $current_url: `${window.location.origin}/oracle/s`,
    });
  }, [mode]);
  return null;
}
