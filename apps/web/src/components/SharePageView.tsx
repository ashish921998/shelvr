"use client";

import { useEffect } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { arrivalCampaign } from "@/lib/appStore";
import type { SharePreviewOutcome } from "@/lib/sharePreview";
import { sharePageUrl, shareRef } from "@/lib/shareRef";

/** Counts one view of a shared item's page, credited to the share, not the
 * token: the event carries a hash of it and a URL with the token removed. */
export default function SharePageView({
  token,
  outcome,
}: {
  token: string;
  outcome: SharePreviewOutcome;
}) {
  useEffect(() => {
    // Remember the share as this visit's campaign so the other store links
    // on the site credit it too.
    arrivalCampaign("?ct=share");
    void shareRef(token).then((ref) =>
      captureWebAnalyticsEvent("share_page_viewed", {
        // An outage is not a dead link, so it reports `unavailable`.
        outcome,
        ...(ref ? { share_ref: ref } : {}),
        $current_url: sharePageUrl(),
      }),
    );
  }, [token, outcome]);
  return null;
}
