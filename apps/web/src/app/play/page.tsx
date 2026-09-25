import type { Metadata } from "next";
import Link from "next/link";

import Header from "@/components/Header";
import { LENS_SLUGS, LENSES } from "@/lib/reveal/lenses";

const TITLE = "What do your screenshots say about you?";
const DESCRIPTION =
  "Four playful ways to read your camera roll. No signup, and your screenshots are never stored.";

export const metadata: Metadata = {
  title: "Play — Shelvr",
  description: DESCRIPTION,
  alternates: { canonical: "/play" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/play",
    siteName: "Shelvr",
    type: "website",
  },
};

export default function PlayPage() {
  return (
    <>
      <Header />
      <main className="container max-w-3xl py-10 sm:py-16">
        <p className="section-kicker">Shelvr Play</p>
        <h1 className="mt-4 text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-ink sm:text-6xl">
          {TITLE}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted sm:text-lg">
          {DESCRIPTION}
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {LENS_SLUGS.map((slug) => {
            const lens = LENSES[slug];
            return (
              <li key={slug}>
                <Link
                  href={`/play/${slug}`}
                  className="soft-card flex h-full flex-col rounded-3xl p-6 transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ember-deep">
                    {lens.name}
                  </span>
                  <span className="display mt-3 text-2xl leading-snug text-ink">
                    {lens.hook}
                  </span>
                  <span className="mt-auto pt-5 text-sm font-semibold text-ink">
                    {lens.shareVerb} →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
