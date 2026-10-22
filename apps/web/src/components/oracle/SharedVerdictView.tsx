"use client";

import { useEffect } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { arrivalCampaign } from "@/lib/appStore";
import type { OracleMode } from "@/lib/oracle";

export default function SharedVerdictView({ mode }: { mode: OracleMode }) {
  useEffect(() => {
    if (!arrivalCampaign(window.location.search)) {
      arrivalCampaign("?ct=oracle_share");
    }
    captureWebAnalyticsEvent("oracle_share_viewed", {
      mode,
      $current_url: `${window.location.origin}/oracle/s`,
    });
  }, [mode]);
  return null;
}
