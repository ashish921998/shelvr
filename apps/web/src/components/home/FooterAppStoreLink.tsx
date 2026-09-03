"use client";

import type { ReactNode } from "react";
import { APP_STORE_URL } from "@/lib/app-store";
import { captureWebAnalyticsEvent } from "@/lib/analytics";

export default function FooterAppStoreLink({ children }: { children: ReactNode }) {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        captureWebAnalyticsEvent("app_store_clicked", {
          source: "footer-nav",
        })
      }
      className="text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      {children}
    </a>
  );
}
