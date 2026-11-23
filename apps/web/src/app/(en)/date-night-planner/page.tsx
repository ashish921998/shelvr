import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import AppStoreButton from "@/components/AppStoreButton";
import Logo from "@/components/common/Logo";
import Footer from "@/components/home/Footer";
import { SAMPLE_CITY } from "@/lib/sampleCity";
import { pageMetadata } from "@/lib/siteMetadata";

const TITLE = "Date Night Planner for Your Saved Places | Shelvr";
const DESCRIPTION =
  "Turn saved restaurants, bars, and cafés into a two-stop date on iPhone. See how Plan a date works in Shelvr Pro, with an example from Lisbon.";

export const metadata: Metadata = {
  ...pageMetadata("/date-night-planner", TITLE, DESCRIPTION),
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const steps = [
  {
    title: "Save places you’d go",
    body: (
      <>
        Share a restaurant Reel or TikTok to Shelvr. You can also{" "}
        <Link
          href="/alternatives/google-maps-lists"
          className="font-bold text-ink underline underline-offset-4"
        >
          share a Google Maps list
        </Link>
        . The places land on a map of their city.
      </>
    ),
  },
  {
    title: "Pick a first stop or a mood",
    body: "Open the city and tap Plan a date. Start with one of your saved places, or pick Classic, Low-key, or Surprise me.",
  },
  {
    title: "Share the plan",
    body: "Get two stops a short walk apart. At least one comes from your saves. You can swap a stop before you share the plan.",
  },
];

export default function DateNightPlannerPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto max-w-6xl px-5 pt-5 sm:px-8 sm:pt-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
        <section className="grid items-center gap-10 pt-10 sm:gap-12 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <h1 className="max-w-[13ch] font-display text-[clamp(42px,7vw,80px)] leading-[0.97] text-balance tracking-tight">
              Plan a date from places you saved
            </h1>
            <p className="mt-5 max-w-[42ch] text-lg leading-relaxed text-pretty text-muted sm:text-xl">
              Turn the restaurants, bars, and cafés you saved into two stops a
              short walk apart.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 sm:mt-8">
              <AppStoreButton source="plan" />
              <p className="max-w-[24ch] text-sm text-muted">
                For iPhone. Personal date plans require Shelvr Pro.
              </p>
            </div>
          </div>

          <figure className="overflow-hidden rounded-3xl border border-line bg-cream p-5 shadow-card sm:max-w-xl sm:p-6 lg:max-w-none">
            <figcaption className="font-display text-3xl leading-none">
              {`Example date in ${SAMPLE_CITY.name}`}
            </figcaption>
            <div className="relative mt-4 aspect-[5/2] overflow-hidden rounded-2xl bg-paper-deep">
              <Image
                src="/images/landing/lisbon-street.jpg"
                alt=""
                fill
                sizes="(min-width: 1024px) 470px, 90vw"
                className="object-cover object-[50%_48%]"
              />
            </div>
            <ol className="mt-4 divide-y divide-line">
              {SAMPLE_CITY.evening.stops.map((stop, index) => (
                <li key={stop.name} className="flex items-start gap-3 py-3">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ember-soft text-sm font-bold text-ink"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm text-muted">{stop.slot}</p>
                    <p className="text-lg font-bold">{stop.name}</p>
                    {index === 0 && (
                      <p className="mt-2 text-sm text-muted">
                        {`About ${SAMPLE_CITY.evening.walkMinutes} minutes on foot to the next stop`}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </figure>
        </section>

        <section className="mt-12 border-t border-line pt-8 sm:mt-20 sm:pt-10">
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            How Plan a date works
          </h2>
          <ol className="mt-6 grid list-decimal gap-6 pl-5 marker:font-bold sm:grid-cols-3 sm:gap-8">
            {steps.map((step) => (
              <li key={step.title} className="pl-1">
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="mt-2 max-w-[36ch] leading-relaxed text-pretty text-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </div>
  );
}
