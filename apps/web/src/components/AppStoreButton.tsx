"use client";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { APP_STORE_URL } from "@/lib/app-store";

type AppStoreButtonProps = {
  source: "header" | "hero" | "footer" | "footer-nav";
  compact?: boolean;
};

export default function AppStoreButton({
  source,
  compact = false,
}: AppStoreButtonProps) {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download Shelvr on the App Store"
      onClick={() => captureWebAnalyticsEvent("app_store_clicked", { source })}
      className={`inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#111] font-semibold text-white shadow-[0_12px_28px_rgba(43,36,24,0.2)] transition hover:-translate-y-0.5 hover:bg-[#282828] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        compact ? "min-h-11 px-5 text-sm" : "min-h-14 px-6 text-left"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={compact ? "h-5 w-5" : "h-7 w-7"}
        fill="currentColor"
      >
        <path d="M19.67 12.77c-.03-3.04 2.49-4.52 2.6-4.59a5.57 5.57 0 0 0-4.39-2.37c-1.85-.2-3.65 1.11-4.59 1.11-.96 0-2.4-1.09-3.97-1.06a5.8 5.8 0 0 0-4.88 2.98c-2.13 3.69-.54 9.11 1.5 12.09 1.02 1.46 2.2 3.09 3.77 3.03 1.53-.06 2.1-.97 3.95-.97 1.83 0 2.37.97 3.96.93 1.65-.03 2.69-1.46 3.67-2.93a12.03 12.03 0 0 0 1.68-3.42 5.24 5.24 0 0 1-3.3-4.83ZM16.67 3.85A5.33 5.33 0 0 0 17.89 0a5.48 5.48 0 0 0-3.54 1.83 5.07 5.07 0 0 0-1.25 3.7 4.52 4.52 0 0 0 3.57-1.68Z" />
      </svg>
      {compact ? (
        <span>Download</span>
      ) : (
        <span className="leading-none">
          <small className="block text-[10px] font-medium uppercase tracking-[0.08em] text-white/75">
            Download on the
          </small>
          <strong className="mt-1 block text-lg leading-none">App Store</strong>
        </span>
      )}
    </a>
  );
}
