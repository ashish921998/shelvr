import type { Metadata } from "next";
import Link from "next/link";

import Header from "@/components/Header";
import MapCta from "@/components/MapCta";
import Footer from "@/components/home/Footer";
import {
  ALTERNATIVES,
  alternativePath,
  HUB_DESCRIPTION,
  HUB_PATH,
  HUB_TITLE,
} from "@/lib/alternatives";
import { pageMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = {
  ...pageMetadata(HUB_PATH, HUB_TITLE, HUB_DESCRIPTION),
  twitter: { card: "summary", title: HUB_TITLE, description: HUB_DESCRIPTION },
};

export default function AlternativesHub() {
  return (
    <div className="min-h-screen overflow-x-clip bg-paper">
      <Header />
      <main className="mx-auto max-w-2xl px-5 pt-10 pb-16 sm:pt-14">
        <p className="text-xs font-bold tracking-[0.1em] text-ember-deep uppercase">
          Compare apps
        </p>
        <h1 className="mt-3 font-display text-[clamp(38px,8vw,60px)] leading-[1.02] text-balance">
          Apps for the places you find in reels, compared
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-normal text-pretty text-muted">
          A few apps now read reels and TikToks and pin their places on a map.
          Each comparison below says what the other app does well, so you can
          pick the one that fits.
        </p>
        <ul className="mt-10 flex flex-col border-t border-line">
          {ALTERNATIVES.map((alt) => (
            <li key={alt.slug} className="border-b border-line">
              <Link
                href={alternativePath(alt)}
                className="flex min-h-12 flex-col justify-center gap-1 py-4 transition-colors hover:text-ember-deep"
              >
                <span className="text-[17px] font-bold">
                  Shelvr vs {alt.name}
                </span>
                <span className="text-base text-muted">{alt.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-3">
          <MapCta source="alternative" />
          <span className="text-sm text-muted">
            On the App Store, for iPhone.
          </span>
        </div>
      </main>
      <Footer />
    </div>
  );
}
