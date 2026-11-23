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
        <h1 className="font-display text-[clamp(38px,8vw,60px)] leading-[1.02] text-balance">
          Compare apps for saving places from Reels
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-normal text-pretty text-muted">
          See which apps turn Reels and TikToks into places on a map, which
          phones they run on, and how they handle trips, dates and shared lists.
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
            For iPhone. Saving and personal plans require Shelvr Pro.
          </span>
        </div>
      </main>
      <Footer />
    </div>
  );
}
