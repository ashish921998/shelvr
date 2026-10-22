"use client";

import { useEffect } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { arrivalCampaign } from "@/lib/appStore";
import type { SharePreviewOutcome } from "@/lib/sharePreview";
import { sharePageUrl, shareRef } from "@/lib/shareRef";

export default function SharePageView({
  token,
  outcome,
}: {
  token: string;
  outcome: SharePreviewOutcome;
}) {
  useEffect(() => {
    if (!arrivalCampaign(window.location.search)) arrivalCampaign("?ct=share");
    void shareRef(token).then((ref) =>
      captureWebAnalyticsEvent("share_page_viewed", {
        outcome,
        ...(ref ? { share_ref: ref } : {}),
        $current_url: sharePageUrl(),
      }),
    );
  }, [token, outcome]);
  return null;
}
