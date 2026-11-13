import type { Metadata } from "next";

import AppStoreButton from "@/components/AppStoreButton";
import Logo from "@/components/common/Logo";
import {
  dotMap,
  loadPassport,
  passportCities,
  passportSummary,
  passportTitle,
  type PassportStamp,
} from "@/lib/passportShare";
import { SUPPORT_EMAIL } from "@/lib/support";

type PageProps = { params: Promise<{ token: string }> };

const MAP = { width: 560, height: 300, pad: 48, spread: 7 };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const { passport } = await loadPassport(token);
  const title = passportTitle(passport);
  const description = passport
    ? `${passportSummary(passport)}. Compare it with yours on Shelvr.`
    : "Places someone went to, kept with Shelvr.";

  return {
    title: `${title} — Shelvr`,
    description,
    alternates: { canonical: `/passport/${token}` },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/passport/${token}`,
      siteName: "Shelvr",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function DotMap({ stamps }: { stamps: PassportStamp[] }) {
  const cities = dotMap(stamps, MAP);
  if (cities.length === 0) return null;
  return (
    <svg
      viewBox={`0 0 ${MAP.width} ${MAP.height}`}
      role="img"
      aria-label="A map with one dot per place, placed at city level"
      className="mt-6 w-full rounded-2xl border border-line bg-paper-deep"
    >
      {cities.map((city) => (
        <g key={`${city.city},${city.x},${city.y}`}>
          {city.dots.map((dot) => (
            <circle
              key={`${dot.x},${dot.y}`}
              cx={dot.x}
              cy={dot.y}
              r={5}
              className="fill-terracotta stroke-cream"
              strokeWidth={1.5}
            />
          ))}
          {city.city ? (
            <text
              x={city.x}
              y={city.labelY}
              textAnchor="middle"
              className="fill-ink-soft text-[13px] font-semibold"
            >
              {city.city}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

export default async function PassportPage({ params }: PageProps) {
  const { token } = await params;
  const { outcome, passport } = await loadPassport(token);

  return (
    <main className="min-h-screen bg-paper">
      <div className="container max-w-xl py-10 sm:py-16">
        <Logo />

        {passport ? (
          <div className="mt-10">
            <p className="text-xs font-semibold tracking-[0.14em] text-ember-deep uppercase">
              Out of the group chat
            </p>
            <h1 className="mt-2 font-display text-[32px] leading-tight text-ink sm:text-4xl">
              {passportTitle(passport)}
            </h1>
            <p className="mt-1 text-[15px] text-muted">
              {passportSummary(passport)}
            </p>
            <DotMap stamps={passport.stamps} />
            <div className="mt-6 flex flex-col gap-4">
              {passportCities(passport.stamps).map((group) => (
                <section
                  key={group.city ?? ""}
                  className="rounded-2xl border border-line bg-card p-5"
                >
                  <h2 className="text-lg font-semibold text-ink">
                    {group.city ?? "Elsewhere"}
                  </h2>
                  <ul className="mt-1">
                    {group.names.map((name, index) => (
                      <li
                        key={`${name}-${index}`}
                        className="mt-1 text-[15px] text-ink"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-10">
            <h1 className="font-display text-[32px] leading-tight text-ink">
              {outcome === "missing"
                ? "This passport isn’t shared anymore"
                : "This passport didn’t load"}
            </h1>
            <p className="mt-2 text-[15px] text-muted">
              {outcome === "missing"
                ? "Keep your own with Shelvr."
                : "Try again in a moment."}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {passport && (
            <a
              href={`shelvr://passport-invite/${encodeURIComponent(token)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-semibold text-cream transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Compare with mine
            </a>
          )}
          <AppStoreButton source="share" compact />
        </div>
        {passport && (
          <p className="mt-4 text-sm text-muted">
            New to Shelvr? Install it, then tap this link again to compare.
          </p>
        )}

        <p className="mt-6 text-xs text-muted">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
              `Report Shelvr passport page /passport/${token}`,
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
