import Link from "next/link";

import Header from "@/components/Header";
import { type Lens, LENSES } from "@/lib/reveal/lenses";

import RevealTool from "./RevealTool";

export default function LensPage({
  lens,
  notice,
}: {
  lens: Lens;
  notice?: string;
}) {
  const info = LENSES[lens];
  return (
    <>
      <Header />
      <main className="container max-w-xl py-10 sm:py-14">
        <p className="section-kicker">{info.name}</p>
        <h1 className="mt-4 text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-ink sm:text-5xl">
          {info.hook}
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">{info.blurb}</p>
        {notice && (
          <p className="mt-6 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink-soft">
            {notice}
          </p>
        )}
        <div className="mt-8">
          <RevealTool lens={lens} />
        </div>
        <p className="mt-10 text-center text-sm text-muted">
          <Link
            href="/play"
            className="underline underline-offset-4 hover:text-ink"
          >
            More ways to read your screenshots
          </Link>
        </p>
      </main>
    </>
  );
}
