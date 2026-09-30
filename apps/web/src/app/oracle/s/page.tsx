import type { Metadata } from "next";
import Link from "next/link";

import Logo from "@/components/common/Logo";
import SharedVerdictView from "@/components/oracle/SharedVerdictView";
import StoreCta from "@/components/oracle/StoreCta";
import VerdictCard from "@/components/oracle/VerdictCard";
import { decodeSharedVerdict, sharedVerdictImagePath } from "@/lib/oracleShare";

type PageProps = { searchParams: Promise<{ c?: string | string[] }> };

async function load({ searchParams }: PageProps) {
  const { c } = await searchParams;
  const code = typeof c === "string" ? c : "";
  return { code, verdict: decodeSharedVerdict(code) };
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { code, verdict } = await load(props);
  const title = verdict
    ? `The Shelvr Oracle says I’m ${verdict.persona}`
    : "The Shelvr Oracle";
  const description = verdict
    ? `${verdict.tagline} What are you?`
    : "Show me what you saved and I’ll tell you who you are.";
  const image = verdict ? sharedVerdictImagePath(code) : undefined;
  return {
    title,
    description,
    alternates: { canonical: "/oracle" },
    // A shared verdict is for the people it was sent to, not for search.
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
      images: image ? [image] : undefined,
    },
  };
}

export default async function SharedVerdictPage(props: PageProps) {
  const { verdict } = await load(props);

  return (
    <main className="min-h-screen bg-paper">
      <div className="container max-w-2xl pt-6">
        <Logo />
      </div>
      <div className="container max-w-2xl pb-16 pt-10 sm:pt-14">
        {verdict ? (
          <>
            <SharedVerdictView mode={verdict.mode} />
            <p className="section-kicker">Someone asked the Shelvr Oracle</p>
            <div className="mt-6">
              <VerdictCard
                verdict={{ ...verdict, guesses: [] }}
                kicker="The oracle says they are"
              />
            </div>
          </>
        ) : (
          <p className="text-lg text-ink-soft">
            This verdict didn’t survive the trip. Ask the oracle for your own.
          </p>
        )}
        <Link
          href={verdict ? `/oracle?mode=${verdict.mode}` : "/oracle"}
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-ember px-6 text-base font-bold text-ink transition hover:-translate-y-0.5 hover:bg-ember-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          What are you? Ask the oracle →
        </Link>
        <StoreCta headline="Save what you love. Shelvr sorts it for you." />
      </div>
    </main>
  );
}
