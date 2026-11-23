import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import AppStoreButton from "@/components/AppStoreButton";
import Logo from "@/components/common/Logo";
import Footer from "@/components/home/Footer";
import { pageMetadata } from "@/lib/siteMetadata";

const TITLE = "How to Save Places from Instagram Reels to a Map | Shelvr";
const DESCRIPTION =
  "Learn how to save places from Instagram Reels and TikToks to a city map on iPhone, with a link to the original video.";

export const metadata: Metadata = {
  ...pageMetadata("/save-places-from-reels", TITLE, DESCRIPTION),
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const steps = [
  {
    title: "Open the iPhone share sheet",
    body: "Tap Share on the Reel. If Instagram opens its own sharing menu first, tap Share to… to see your iPhone apps. You can also share from TikTok.",
  },
  {
    title: "Choose Shelvr",
    body: "Tap Shelvr in the app row. If you don’t see it, scroll across to More. You can also copy the video link, open Shelvr, tap +, and choose Paste a link.",
  },
  {
    title: "Find the places on your map",
    body: "Open Map when the save is ready. The places Shelvr finds appear as pins, and each save links back to the original video.",
  },
];

export default function SavePlacesFromReelsPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto max-w-6xl px-5 pt-5 sm:px-8 sm:pt-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
        <div className="grid items-start gap-10 pt-10 sm:gap-12 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <h1 className="max-w-[15ch] font-display text-[clamp(43px,6vw,76px)] leading-[0.98] text-balance tracking-tight">
              Save places from Instagram Reels to a map
            </h1>
            <p className="mt-5 max-w-[45ch] text-lg leading-relaxed text-pretty text-muted sm:text-xl">
              Share a Reel or TikTok to Shelvr on iPhone. Shelvr finds the
              places named in the video and pins them under their city.
            </p>
            <ol className="mt-8 grid list-decimal gap-5 border-t border-line pt-6 pl-5 marker:font-bold">
              {steps.map((step) => (
                <li key={step.title} className="pl-1">
                  <h2 className="text-lg font-bold">{step.title}</h2>
                  <p className="mt-1 max-w-[52ch] leading-relaxed text-pretty text-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
            <div className="mt-6">
              <AppStoreButton source="hero" />
            </div>
          </div>

          <figure className="w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-cream shadow-card">
            <Image
              src="/images/landing/app-prague-map.jpg"
              alt="Shelvr’s map of Prague with pins for Kampa Park, Hemingway Bar, and Café Louvre"
              width={1056}
              height={863}
              sizes="(min-width: 1024px) 460px, (min-width: 640px) 576px, 94vw"
              className="block h-auto w-full"
            />
            <figcaption className="grid gap-2 border-t border-line p-5 sm:p-6">
              <span className="font-display text-3xl leading-tight">
                Three saves in Prague
              </span>
              <span className="leading-relaxed text-muted">
                Kampa Park, Hemingway Bar, and Café Louvre appear on one city
                map. Each save links back to its original video.
              </span>
            </figcaption>
          </figure>
        </div>

        <div className="mt-12 grid gap-6 border-t border-line pt-6 text-base leading-relaxed text-muted sm:mt-16 sm:grid-cols-2 sm:gap-10">
          <p>
            Looking for a place named in a caption?{" "}
            <Link
              className="font-bold text-ink underline underline-offset-4"
              href="/reel-place-finder"
            >
              Try the free Reel Place Finder.
            </Link>
          </p>
          <p>
            Ready to use your saves?{" "}
            <Link
              className="font-bold text-ink underline underline-offset-4"
              href="/date-night-planner"
            >
              Plan a date from places you saved.
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
