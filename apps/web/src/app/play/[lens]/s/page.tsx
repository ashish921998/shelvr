import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AppStoreButton from "@/components/AppStoreButton";
import Header from "@/components/Header";
import LensPage from "@/components/play/LensPage";
import RevealCard from "@/components/play/RevealCard";
import SharePageView from "@/components/play/SharePageView";
import { isLens, LENSES } from "@/lib/reveal/lenses";
import { revealHeadline } from "@/lib/reveal/schema";
import { decodeReveal } from "@/lib/reveal/shareCode";

type PageProps = {
  params: Promise<{ lens: string }>;
  searchParams: Promise<{ c?: string | string[] }>;
};

async function load({ params, searchParams }: PageProps) {
  const [{ lens }, { c }] = await Promise.all([params, searchParams]);
  if (!isLens(lens)) notFound();
  const code = typeof c === "string" ? c : "";
  const reveal = decodeReveal(code);
  // A share link encodes its lens too; a card opened under another lens's
  // path is treated as broken rather than shown under the wrong hook.
  return { lens, code, reveal: reveal?.lens === lens ? reveal : undefined };
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { lens, code, reveal } = await load(props);
  const { name, blurb, shareVerb } = LENSES[lens];
  const title = reveal ? revealHeadline(reveal) : name;
  const description = reveal ? `${shareVerb} with Shelvr.` : blurb;
  const image = reveal ? `/play/${lens}/og?c=${code}` : undefined;
  return {
    title: `${title} — Shelvr`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: "Shelvr",
      type: "website",
      images: image ? [{ url: image, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
    },
  };
}

export default async function RevealSharePage(props: PageProps) {
  const { lens, reveal } = await load(props);
  if (!reveal) {
    return (
      <LensPage
        lens={lens}
        notice="This card has expired. Make a fresh one below."
      />
    );
  }
  const { installBridge } = LENSES[lens];

  return (
    <>
      <SharePageView lens={lens} />
      <Header />
      <main className="container max-w-xl py-10 sm:py-14">
        <RevealCard reveal={reveal} />
        <Link
          href={`/play/${lens}`}
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-ink px-6 text-base font-semibold text-white shadow-card transition hover:bg-ink-soft"
        >
          Try yours →
        </Link>
        <div className="mt-6 rounded-3xl bg-ember-soft px-6 py-8 text-center">
          <p className="display text-2xl leading-snug text-ink">
            {installBridge}
          </p>
          <div className="mt-5 flex justify-center">
            <AppStoreButton source="play" campaign={`play_${lens}_share`} />
          </div>
        </div>
      </main>
    </>
  );
}
