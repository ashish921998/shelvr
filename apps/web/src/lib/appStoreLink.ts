"use client";

import { useEffect, useState } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { appStoreUrl, arrivalCampaign } from "@/lib/appStore";
import { sharePageUrl, shareRef } from "@/lib/shareRef";

type AppStoreLinkSource =
  | "header"
  | "hero"
  | "footer"
  | "footer-nav"
  | "share"
  | "oracle";

/**
 * The App Store link for one button, tagged with the campaign the visitor
 * arrived with (a creator's `?ct=`), or else with where the button sits, and
 * the matching `app_store_clicked` event.
 */
export function useAppStoreLink(
  source: AppStoreLinkSource,
  shareToken?: string,
) {
  const fallback = source === "share" ? "share" : `web_${source}`;
  const [campaign, setCampaign] = useState(fallback);
  useEffect(() => {
    // The search string only exists in the browser, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCampaign(arrivalCampaign(window.location.search) ?? fallback);
  }, [fallback]);

  const onClick = () => {
    if (!shareToken) {
      captureWebAnalyticsEvent("app_store_clicked", { source, campaign });
      return;
    }
    void shareRef(shareToken).then((ref) =>
      captureWebAnalyticsEvent("app_store_clicked", {
        source,
        campaign,
        ...(ref ? { share_ref: ref } : {}),
        $current_url: sharePageUrl(),
      }),
    );
  };

  return { href: appStoreUrl(campaign), onClick };
}
