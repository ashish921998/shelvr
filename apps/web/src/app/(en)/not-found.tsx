import type { Metadata } from "next";
import Link from "next/link";

import Logo from "@/components/common/Logo";

export const metadata: Metadata = {
  title: "Page not found — Shelvr",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="bg-paper min-h-screen">
      <div className="container max-w-2xl py-10 sm:py-16">
        <Logo />

        <div className="mt-10">
          <p className="section-kicker">Nothing on this shelf</p>
        </div>
        <h1 className="font-display mt-4 text-4xl text-balance text-ink sm:text-5xl">
          That page isn’t here.
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-ink/90">
          The link may be old, or the address may have a typo. Everything Shelvr
          does is one page away.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-6 py-3 font-semibold text-paper transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Back to the shelf
          </Link>
          <Link
            href="/support"
            className="inline-flex min-h-11 items-center text-[15px] font-medium text-ember-deep underline underline-offset-4 hover:text-ink"
          >
            Ask for help
          </Link>
        </div>
      </div>
    </main>
  );
}
