"use client";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { appStoreUrl, arrivalCampaign } from "@/lib/appStore";
import { bioAppStoreUrl } from "@/lib/bioLink";
import { useBrowserValue } from "@/lib/browserValue";
import { sharePageUrl, shareRef } from "@/lib/shareRef";

type AppStoreLinkSource =
  | "header"
  | "hero"
  | "footer"
  | "share"
  | "oracle"
  | "plan"
  | "bio"
  | "place_tool";

export function useArrivalCampaign(fallback: string) {
  return useBrowserValue(
    () => arrivalCampaign(window.location.search) ?? fallback,
    fallback,
  );
}

export function useAppStoreLink(
  source: AppStoreLinkSource,
  shareToken?: string,
) {
  const campaign = useArrivalCampaign(
    source === "share" ? "share" : `web_${source}`,
  );

  const onClick = () => {
    if (!shareToken) {
      captureWebAnalyticsEvent("app_store_clicked", {
        source,
        campaign,
        ...(source === "oracle"
          ? {
              $current_url: `${window.location.origin}${window.location.pathname}`,
            }
          : {}),
      });
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

  return {
    href: source === "bio" ? bioAppStoreUrl(campaign) : appStoreUrl(campaign),
    onClick,
  };
}
