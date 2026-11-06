"use client";

import { useEffect } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { arrivalCampaign } from "@/lib/appStore";
import type { PublicMapCounts, PublicMapOutcome } from "@/lib/publicMap";
import { shareRef } from "@/lib/shareRef";

export default function MapPageView({
  token,
  outcome,
  counts,
  saveAll,
}: {
  token: string;
  outcome: PublicMapOutcome;
  counts: PublicMapCounts;
  saveAll: boolean;
}) {
  const { cities, places, been } = counts;
  useEffect(() => {
    if (!arrivalCampaign(window.location.search)) arrivalCampaign("?ct=map");
    void shareRef(token).then((ref) =>
      captureWebAnalyticsEvent("map_page_viewed", {
        outcome,
        cities,
        places,
        been,
        save_all: saveAll,
        ...(ref ? { share_ref: ref } : {}),
      }),
    );
  }, [token, outcome, cities, places, been, saveAll]);
  return null;
}
