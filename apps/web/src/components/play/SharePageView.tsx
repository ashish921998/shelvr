"use client";

import { useEffect } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { arrivalCampaign } from "@/lib/appStore";
import type { Lens } from "@/lib/reveal/lenses";

/** Counts one view of a shared reveal card and, unless the visitor arrived
 * with a campaign of their own, credits the rest of the visit to it. */
export default function SharePageView({ lens }: { lens: Lens }) {
  useEffect(() => {
    if (!arrivalCampaign(window.location.search)) {
      arrivalCampaign(`?ct=play_${lens}_share`);
    }
    // The card's text rides in `?c=`, so the event keeps the path only.
    captureWebAnalyticsEvent("reveal_share_viewed", {
      lens,
      $current_url: `${window.location.origin}/play/${lens}/s`,
    });
  }, [lens]);
  return null;
}
