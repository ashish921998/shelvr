import type { Metadata } from "next";
import { headers } from "next/headers";

import AppStoreButton from "@/components/AppStoreButton";
import PlanVote from "@/components/PlanVote";
import Logo from "@/components/common/Logo";
import AndroidWaitlist from "@/components/home/AndroidWaitlist";
import { loadPlanShare, planTitle } from "@/lib/planShare";
import { SUPPORT_EMAIL } from "@/lib/support";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const { share } = await loadPlanShare(token);
  const title = planTitle(share);
  const description = share
    ? `Tap ✓ on the ones you'd go to: ${share.places
        .map((place) => place.name)
        .join(", ")}.`
    : "A shortlist of places, made with Shelvr.";

  return {
    title: `${title} — Shelvr`,
    description,
    // Without its own canonical and og:url the page inherits "/", and Facebook and Messenger preview the homepage.
    alternates: { canonical: `/p/${token}` },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/p/${token}`,
      siteName: "Shelvr",
      type: "website",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function PlanVotePage({ params }: PageProps) {
  const { token } = await params;
  const { outcome, share } = await loadPlanShare(token);
  const android = /android/i.test((await headers()).get("user-agent") ?? "");

  return (
    <main className="min-h-screen bg-paper">
      <div className="container max-w-xl py-10 sm:py-16">
        <Logo />

        {share ? (
          <>
            <h1 className="mt-10 font-display text-[32px] leading-tight text-ink sm:text-4xl">
              {planTitle(share)}
            </h1>
            <p className="mt-1 mb-5 text-[15px] text-muted">
              Tap ✓ on the ones you&apos;d go to.
            </p>
            <PlanVote
              token={token}
              places={share.places}
              senderName={share.senderName}
            />
          </>
        ) : (
          <div className="mt-10">
            <h1 className="font-display text-[32px] leading-tight text-ink">
              {outcome === "missing"
                ? "This shortlist has closed"
                : "This shortlist didn't load"}
            </h1>
            <p className="mt-2 text-[15px] text-muted">
              {outcome === "missing"
                ? "Vote links stay open for a week. Ask for a fresh one."
                : "Try again in a moment."}
            </p>
          </div>
        )}

        {android ? (
          <div className="mt-8 flex flex-col items-center gap-1 rounded-2xl border border-line bg-card p-4 text-center">
            <p className="text-[15px] font-semibold text-ink">
              Save places like these
            </p>
            <AndroidWaitlist source="plan" tone="light" />
          </div>
        ) : (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">
                Save places like these
              </p>
              <p className="text-sm text-muted">Shelvr for iPhone</p>
            </div>
            <AppStoreButton source="plan" compact />
          </div>
        )}

        <p className="mt-6 text-xs text-muted">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
              `Report Shelvr shortlist page /p/${token}`,
            )}`}
            className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
          >
            Report this page
          </a>{" "}
          or email <span className="select-all">{SUPPORT_EMAIL}</span>
        </p>
      </div>
    </main>
  );
}
