"use client";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import type { InAppBrowser } from "@/lib/bioLink";
import { shareRef } from "@/lib/shareRef";

export default function SaveAllLink({
  href,
  label,
  token,
  places,
  cities,
  inApp,
}: {
  href: string;
  label: string;
  token: string;
  places: number;
  cities: number;
  inApp: InAppBrowser | undefined;
}) {
  const onClick = () => {
    void shareRef(token).then((ref) =>
      captureWebAnalyticsEvent("creator_map_save_clicked", {
        places,
        cities,
        ...(inApp ? { in_app: inApp } : {}),
        ...(ref ? { share_ref: ref } : {}),
      }),
    );
  };
  return (
    <a
      href={href}
      onClick={onClick}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-ember px-5 py-3 text-center text-[15px] font-bold text-dark [overflow-wrap:anywhere] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {label}
    </a>
  );
}
