"use client";

import Image from "next/image";
import { useEffect } from "react";

import AppStoreButton from "@/components/AppStoreButton";
import AndroidWaitlist from "@/components/home/AndroidWaitlist";
import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { arrivalCampaign } from "@/lib/appStore";
import { useAppStoreLink, useArrivalCampaign } from "@/lib/appStoreLink";
import { useBrowserValue } from "@/lib/browserValue";
import {
  CHROME_TRIED_PARAM,
  PLAY_STORE_LIVE,
  bioAction,
  bioAppStoreUrl,
  chromeIntentUrl,
  isIPadDesktop,
  playStoreUrl,
  type InAppBrowser,
  type Platform,
} from "@/lib/bioLink";

const CHROME_TRIED_KEY = "shelvr_bio_chrome_tried";

type BioLinkProps = {
  inApp: InAppBrowser | undefined;
  platform: Platform;
};

export default function BioLink({
  inApp,
  platform: serverPlatform,
}: BioLinkProps) {
  const platform = useBrowserValue<Platform>(
    () =>
      isIPadDesktop(navigator.userAgent, navigator.maxTouchPoints)
        ? "ios"
        : serverPlatform,
    serverPlatform,
  );
  const action = bioAction(inApp, platform);

  useEffect(() => {
    const campaign = arrivalCampaign(window.location.search) ?? "web_bio";
    if (action === "overlay" && inApp) {
      captureWebAnalyticsEvent("bio_in_app_overlay_shown", {
        app: inApp,
        platform,
        campaign,
      });
      if (platform === "android") tryChrome(inApp, campaign);
      return;
    }
    if (action === "stay") return;
    captureWebAnalyticsEvent(
      action === "app_store" ? "app_store_clicked" : "play_store_clicked",
      { source: "bio", campaign, auto: true },
    );
    window.location.replace(
      action === "app_store"
        ? bioAppStoreUrl(campaign)
        : playStoreUrl(campaign),
    );
  }, [action, inApp, platform]);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-paper px-6 pt-16 pb-10 text-center">
      <Image
        src="/shelvr-mark.svg"
        alt=""
        width={64}
        height={64}
        aria-hidden
        className="h-16 w-16"
      />
      <h1 className="mt-7 font-display text-[44px] leading-[.98] text-ink text-balance">
        Saved it.
        <br />
        Now <span className="text-terracotta">go there</span>.
      </h1>
      <p className="mt-4 max-w-[30ch] text-[17px] leading-[1.4] text-muted">
        Share a reel or TikTok to Shelvr. Its places land on a map of their
        city, ready for a date night or a trip.
      </p>
      {platform === "android" && !PLAY_STORE_LIVE ? (
        <div className="mt-8 w-full max-w-[380px]">
          <AndroidWaitlist source="bio" tone="light" />
        </div>
      ) : (
        <div className="mt-8 flex w-full max-w-[380px] flex-col items-center gap-4 [&>a]:w-full">
          {platform === "android" ? (
            <PlayStoreButton />
          ) : (
            <AppStoreButton source="bio" />
          )}
          {action === "app_store" || action === "play_store" ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <span
                aria-hidden
                className="size-3.5 animate-spin rounded-full border-2 border-line border-t-ember-deep"
              />
              {action === "app_store"
                ? "Opening the App Store…"
                : "Opening Google Play…"}
            </p>
          ) : null}
        </div>
      )}
      <p className="mt-auto pt-10 text-[13px] font-medium text-muted">
        {PLAY_STORE_LIVE ? "iPhone and Android" : "iPhone"} · No ads, data isn’t
        sold
      </p>
      {action === "overlay" && inApp ? (
        <InAppOverlay inApp={inApp} platform={platform} />
      ) : null}
    </main>
  );
}

function tryChrome(inApp: InAppBrowser, campaign: string) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has(CHROME_TRIED_PARAM)) return;
    if (window.sessionStorage.getItem(CHROME_TRIED_KEY)) return;
    window.sessionStorage.setItem(CHROME_TRIED_KEY, "1");
  } catch {
    return;
  }
  captureWebAnalyticsEvent("bio_chrome_handoff", {
    app: inApp,
    campaign,
    auto: true,
  });
  window.location.href = chromeIntentUrl(window.location.href);
}

function InAppOverlay({
  inApp,
  platform,
}: BioLinkProps & { inApp: InAppBrowser }) {
  const { href, onClick } = useAppStoreLink("bio");
  const android = platform === "android";
  // Instagram's Android menu names Chrome; TikTok's and the iPhone menus say
  // "browser".
  const menuItem =
    android && inApp === "instagram" ? "Open in Chrome" : "Open in browser";

  const openChrome = () => {
    captureWebAnalyticsEvent("bio_chrome_handoff", {
      app: inApp,
      campaign: arrivalCampaign(window.location.search) ?? "web_bio",
      auto: false,
    });
    window.location.href = chromeIntentUrl(window.location.href);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bio-overlay-title"
      className="fixed inset-0 z-50 flex flex-col items-center bg-dark px-6 pt-6 pb-8 text-center text-white"
    >
      <svg
        aria-hidden
        viewBox="0 0 110 120"
        fill="none"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute top-1 right-3 h-[120px] w-[110px] text-ember"
      >
        <path d="M20 112 C 30 60, 60 40, 88 14" />
        <path d="M62 12 L 90 12 L 88 40" />
      </svg>
      <h2
        id="bio-overlay-title"
        className="mt-[120px] font-display text-[38px] leading-[1.02]"
      >
        Open Shelvr in
        <br />
        <span className="text-ember">
          {android ? "Chrome" : "your browser"}
        </span>
      </h2>
      <ol className="mt-7 flex w-full max-w-[380px] flex-col gap-3 text-left text-[17px] font-semibold">
        <li className="flex items-center gap-3.5 rounded-2xl border border-white/12 bg-white/8 px-4 py-3.5">
          <StepNumber n={1} />
          <span>
            Tap{" "}
            <span className="rounded-lg bg-white px-2 font-black tracking-[1px] text-dark">
              {android ? "⋮" : "•••"}
            </span>{" "}
            up top
          </span>
        </li>
        <li className="flex items-center gap-3.5 rounded-2xl border border-white/12 bg-white/8 px-4 py-3.5">
          <StepNumber n={2} />
          <span>
            Tap <b>{menuItem}</b>
          </span>
        </li>
      </ol>
      {android ? (
        <button
          type="button"
          onClick={openChrome}
          className="mt-3.5 h-[52px] w-full max-w-[380px] rounded-2xl bg-ember text-[17px] font-extrabold text-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-light"
        >
          Open in Chrome
        </button>
      ) : null}
      <p className="mt-auto text-[13px] leading-[1.5] text-white/60">
        {android ? (
          "Chrome didn’t open? Use the steps above."
        ) : (
          <>
            The App Store can’t open from here.
            <br />
            Or{" "}
            <a href={href} onClick={onClick} className="text-white underline">
              try the App Store anyway
            </a>
          </>
        )}
      </p>
    </div>
  );
}

function PlayStoreButton() {
  const campaign = useArrivalCampaign("web_bio");
  return (
    <a
      href={playStoreUrl(campaign)}
      onClick={() =>
        captureWebAnalyticsEvent("play_store_clicked", {
          source: "bio",
          campaign,
        })
      }
      className="inline-flex min-h-14 items-center justify-center rounded-xl bg-[#111] px-6 text-lg font-semibold text-white"
    >
      Get it on Google Play
    </a>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="grid size-[30px] flex-none place-items-center rounded-full bg-ember text-[15px] font-extrabold text-dark">
      {n}
    </span>
  );
}
