"use client";

import Image from "next/image";
import { useState } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { useAppStoreLink } from "@/lib/appStoreLink";
import { useBrowserValue } from "@/lib/browserValue";

const DISMISSED_KEY = "shelvr_place_banner_dismissed";

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {}
}

export default function AppBanner() {
  const { href, onClick } = useAppStoreLink("place_banner");
  const allowed = useBrowserValue(() => !wasDismissed(), false);
  const [closed, setClosed] = useState(false);

  if (!allowed || closed) return null;

  return (
    <div className="flex items-center gap-3 bg-ink px-3 py-2.5 text-white sm:hidden">
      <Image
        src="/shelvr-mark.svg"
        alt=""
        width={44}
        height={44}
        className="size-11 shrink-0 rounded-[10px]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-tight font-bold">Shelvr</p>
        <p className="truncate text-[13px] leading-tight text-white/70">
          Save reels, plan your trip
        </p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="inline-flex min-h-10 items-center rounded-full bg-ember px-4 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Get
      </a>
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          rememberDismissed();
          captureWebAnalyticsEvent("place_tool_banner_dismissed");
          setClosed(true);
        }}
        className="flex size-10 shrink-0 items-center justify-center text-xl text-white/80 focus-visible:outline-2 focus-visible:outline-white"
      >
        <span aria-hidden>✕</span>
      </button>
    </div>
  );
}
