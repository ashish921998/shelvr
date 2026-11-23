import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import AppStoreButton from "@/components/AppStoreButton";
import Logo from "@/components/common/Logo";
import Footer from "@/components/home/Footer";
import { pageMetadata } from "@/lib/siteMetadata";

const TITLE = "Trip Planner for Your Saved Places | Shelvr";
const DESCRIPTION =
  "Turn places from saved Instagram Reels and TikToks into a day-by-day trip on iPhone. Edit the stops and share your itinerary with Shelvr Pro.";

export const metadata: Metadata = {
  ...pageMetadata("/trip-planner", TITLE, DESCRIPTION),
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const exampleStops = [
  { time: "Morning", place: "Miradouro da Graça" },
  { time: "Lunch", place: "Time Out Market" },
  { time: "Afternoon", place: "LX Factory" },
  { time: "Evening", place: "Pastéis de Belém" },
];

const steps = [
  {
    title: "Choose your city and days",
    body: "Open a city in Shelvr and tap Plan a trip, then Generate an itinerary. Choose how many days you have, what you’re into, and your pace.",
  },
  {
    title: "See your itinerary on a map",
    body: "Shelvr starts with places you saved and groups stops by day. It can suggest nearby places from Apple Maps to fill gaps.",
  },
  {
    title: "Adjust the trip and share it",
    body: "Move stops between days, add a place, or set it aside in Unplanned. Share a link when you’re ready to send the itinerary.",
  },
];

export default function TripPlannerPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto max-w-6xl px-5 pt-5 sm:px-8 sm:pt-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
        <section className="grid items-center gap-10 pt-10 sm:gap-12 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <h1 className="max-w-[14ch] font-display text-[clamp(42px,7vw,80px)] leading-[0.97] text-balance tracking-tight">
              Plan a trip from places you saved
            </h1>
            <p className="mt-5 max-w-[42ch] text-lg leading-relaxed text-pretty text-muted sm:text-xl">
              Turn places from saved Instagram Reels and TikToks into a
              day-by-day itinerary you can edit and share.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 sm:mt-8">
              <AppStoreButton source="plan" />
              <p className="max-w-[24ch] text-sm text-muted">
                For iPhone. Personal trip planning requires Shelvr Pro.
              </p>
            </div>
          </div>

          <figure className="w-full max-w-xl rounded-3xl border border-line bg-cream p-5 shadow-card sm:p-6 lg:max-w-none">
            <figcaption className="font-display text-3xl leading-none">
              Example day in Lisbon
            </figcaption>
            <div className="relative mt-4 aspect-[5/3] overflow-hidden rounded-2xl bg-paper-deep">
              <Image
                src="/images/landing/app-plan.jpg"
                alt="Illustration of four stops connected on a map"
                fill
                sizes="(min-width: 1024px) 470px, (min-width: 640px) 540px, 90vw"
                className="object-cover object-[center_30%]"
              />
            </div>
            <ol className="mt-3 divide-y divide-line">
              {exampleStops.map(({ time, place }) => (
                <li
                  key={place}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
                >
                  <span className="w-24 text-sm text-muted">{time}</span>
                  <span className="font-bold">{place}</span>
                </li>
              ))}
            </ol>
          </figure>
        </section>

        <section className="mt-12 border-t border-line pt-8 sm:mt-20 sm:pt-10">
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            How Plan a trip works
          </h2>
          <ol className="mt-6 grid list-decimal gap-6 pl-5 marker:font-bold sm:grid-cols-3 sm:gap-8">
            {steps.map(({ title, body }) => (
              <li key={title} className="pl-1">
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-2 max-w-[36ch] leading-relaxed text-pretty text-muted">
                  {body}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-8 leading-relaxed text-muted">
            Still collecting ideas?{" "}
            <Link
              href="/save-places-from-reels"
              className="font-bold text-ink underline underline-offset-4"
            >
              See how to save places from Reels to your map.
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
