import type { Metadata } from "next";
import Link from "next/link";

import Logo from "@/components/common/Logo";
import Footer from "@/components/home/Footer";
import AppBanner from "@/components/tools/AppBanner";
import ReelPlaceFinder from "@/components/tools/ReelPlaceFinder";
import { googleMapsUrl } from "@/lib/reelPlaces";
import { pageMetadata } from "@/lib/siteMetadata";

const PATH = "/reel-place-finder";
const TITLE = "Find the Places in an Instagram Reel or TikTok | Shelvr";
const DESCRIPTION =
  "Paste a public Instagram Reel or TikTok link to find places named in its caption. Get an Apple Maps and Google Maps link for each place. No login.";

const SAMPLE_CAPTION_PLACES = [
  { name: "Manteigaria", city: "Lisbon" },
  { name: "LX Factory", city: "Lisbon" },
];

export const metadata: Metadata = {
  ...pageMetadata(PATH, TITLE, DESCRIPTION),
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  "Open the reel or TikTok and tap Share.",
  "Tap “Copy link”.",
  "Paste it above and tap “Find the places”.",
  "Open any place in Apple Maps or Google Maps.",
];

const FAQS = [
  {
    q: "How do I find the location of an Instagram reel?",
    a: "Paste the reel’s link above. The finder reads the caption, then lists every restaurant, café, shop or sight it names, with a Maps link for each. If the creator tagged a location, it’s on the reel itself, under their name.",
  },
  {
    q: "Does it work for TikTok too?",
    a: "Yes. Paste a TikTok link the same way and it reads the caption.",
  },
  {
    q: "Why did it find nothing?",
    a: "Many reels only say the place out loud or show it on screen. The finder reads the written caption, so a reel that never writes a place name comes back empty. Check the comments too, since creators often pin the list there.",
  },
  {
    q: "Do I need to log in to Instagram or TikTok?",
    a: "No. You only paste a public link. Private posts can’t be read.",
  },
  {
    q: "Do you keep the link I paste?",
    a: "No. The link is read once to find the places, and the result isn’t saved to an account because there isn’t one.",
  },
  {
    q: "How do I save these places for a trip?",
    a: "Shelvr, the iPhone app below the results, does that part: share a reel to it and its places land under a city on a map, ready for a date or a trip plan.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "Reel Place Finder",
      url: `https://tryshelvr.app${PATH}`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: DESCRIPTION,
      publisher: { "@type": "Organization", name: "Shelvr" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
  ],
};

export default function ReelPlaceFinderPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-paper">
      <AppBanner />
      <header className="mx-auto max-w-2xl px-5 pt-5">
        <Logo />
      </header>
      <main className="mx-auto max-w-2xl px-5 pt-10 pb-16 sm:pt-14">
        <p className="text-xs font-bold tracking-[0.1em] text-ember-deep uppercase">
          Free tool · No login
        </p>
        <h1 className="mt-3 font-display text-[clamp(38px,8vw,60px)] leading-[1.02] text-balance">
          Find places named in an Instagram Reel or TikTok caption
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-normal text-pretty text-muted">
          Paste a public link to get an Apple Maps and Google Maps link for each
          place the caption names.
        </p>

        <ReelPlaceFinder />

        <section
          aria-labelledby="sample-caption"
          className="mt-5 rounded-2xl border border-line bg-paper-deep px-5 pt-4 pb-2 sm:px-6"
        >
          <h2 id="sample-caption" className="text-sm font-bold text-ink">
            Sample caption
          </h2>
          <blockquote className="mt-1 text-base text-pretty text-ink-soft">
            “Start at Manteigaria, then head to LX Factory.”
          </blockquote>
          <p className="mt-3 text-sm font-bold text-ink">Places found</p>
          <ul className="flex flex-wrap gap-x-5">
            {SAMPLE_CAPTION_PLACES.map((place) => (
              <li key={place.name}>
                <a
                  href={googleMapsUrl(place)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${place.name} in Google Maps`}
                  className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {place.name}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-[32px] leading-tight sm:text-[40px]">
            How it works
          </h2>
          <ol className="mt-5 flex flex-col gap-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span
                  aria-hidden
                  className="flex size-8 flex-none items-center justify-center rounded-full bg-ember-soft text-sm font-bold text-ember-deep"
                >
                  {i + 1}
                </span>
                <p className="pt-1 text-base leading-normal text-ink-soft">
                  {step}
                </p>
              </li>
            ))}
          </ol>
          <Link
            className="mt-4 inline-flex min-h-11 items-center text-base font-bold text-ember-deep underline underline-offset-4"
            href="/save-places-from-reels"
          >
            How to keep places from Reels on your iPhone map
          </Link>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-[32px] leading-tight sm:text-[40px]">
            Questions
          </h2>
          <div className="mt-4 border-t border-line">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group border-b border-line">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-bold [&::-webkit-details-marker]:hidden">
                  <h3>{faq.q}</h3>
                  <span
                    aria-hidden
                    className="flex size-7 flex-none items-center justify-center rounded-full bg-paper-deep text-lg leading-none transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-[56ch] pr-11 pb-[18px] text-base leading-[1.55] text-pretty text-muted">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <Footer />
      <script
        type="application/ld+json"
        // Static content defined above; no user input reaches it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </div>
  );
}
