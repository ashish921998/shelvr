import type { Metadata } from "next";

import AppStoreButton from "@/components/AppStoreButton";
import Logo from "@/components/common/Logo";
import { inviteHeading, inviteSummary, loadListInvite } from "@/lib/listInvite";
import { SUPPORT_EMAIL } from "@/lib/support";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const { invite } = await loadListInvite(token);
  const title = inviteHeading(invite);
  const description = invite
    ? `Join ${invite.name} on Shelvr. Free to join. You don’t need Pro.`
    : "A shared list of places, made with Shelvr.";

  return {
    title: `${title} — Shelvr`,
    description,
    alternates: { canonical: `/l/${token}` },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/l/${token}`,
      siteName: "Shelvr",
      type: "website",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function ListInvitePage({ params }: PageProps) {
  const { token } = await params;
  const { outcome, invite } = await loadListInvite(token);

  return (
    <main className="min-h-screen bg-paper">
      <div className="container max-w-xl py-10 sm:py-16">
        <Logo />

        {invite ? (
          <div className="mt-10">
            <h1 className="font-display text-[32px] leading-tight text-ink sm:text-4xl">
              {inviteHeading(invite)}
            </h1>
            <div className="mt-6 rounded-2xl border border-line bg-card p-5">
              <p className="text-lg font-semibold text-ink">{invite.name}</p>
              <p className="mt-1 text-[15px] text-muted">
                {inviteSummary(invite)}
              </p>
              {invite.placeNames.slice(0, 2).map((placeName) => (
                <p key={placeName} className="mt-1 text-[15px] text-ink">
                  {placeName}
                </p>
              ))}
            </div>
            <p className="mt-4 text-[15px] text-muted">
              Free to join. You don’t need Pro.
            </p>
          </div>
        ) : (
          <div className="mt-10">
            <h1 className="font-display text-[32px] leading-tight text-ink">
              {outcome === "missing"
                ? "This invite isn’t active anymore."
                : "This invite didn’t load"}
            </h1>
            <p className="mt-2 text-[15px] text-muted">
              {outcome === "missing"
                ? "Ask for a new link."
                : "Try again in a moment."}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {invite && (
            <a
              href={`shelvr://list-invite/${encodeURIComponent(token)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-card px-5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Open in Shelvr
            </a>
          )}
          <AppStoreButton source="share" compact />
        </div>
        {invite && (
          <p className="mt-4 text-sm text-muted">
            New to Shelvr? Install it, then tap your invite link again.
          </p>
        )}

        <p className="mt-6 text-xs text-muted">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
              `Report Shelvr invite page /l/${token}`,
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
