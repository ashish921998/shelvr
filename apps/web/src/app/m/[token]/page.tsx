import type { Metadata } from "next";
import { headers } from "next/headers";

import AppStoreButton from "@/components/AppStoreButton";
import MapPageView from "@/components/MapPageView";
import Logo from "@/components/common/Logo";
import AndroidWaitlist from "@/components/home/AndroidWaitlist";
import MapCitySection from "@/components/map/MapCitySection";
import {
  loadPublicMap,
  mapCounts,
  mapMetadata,
  mapTitle,
  type PublicMap,
  type PublicMapCounts,
  type PublicMapOutcome,
} from "@/lib/publicMap";
import { SUPPORT_EMAIL } from "@/lib/support";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  return mapMetadata(token, (await loadPublicMap(token)).map);
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-3 text-center">
      <p className="font-display text-3xl leading-none text-ink">
        {value.toLocaleString("en-US")}
      </p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}

function Counters({ counts }: { counts: PublicMapCounts }) {
  return (
    <div
      className={`mt-6 grid gap-3 ${counts.been > 0 ? "grid-cols-3" : "grid-cols-2"}`}
    >
      <Counter
        value={counts.cities}
        label={counts.cities === 1 ? "city" : "cities"}
      />
      <Counter
        value={counts.places}
        label={counts.places === 1 ? "place" : "places"}
      />
      {counts.been > 0 ? (
        <Counter value={counts.been} label="been there" />
      ) : null}
    </div>
  );
}

function Legend() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
      <li className="flex items-center gap-2">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5">
          <circle
            cx={10}
            cy={10}
            r={8}
            strokeWidth={1.5}
            className="fill-cream stroke-muted"
          />
        </svg>
        Want to go
      </li>
      <li className="flex items-center gap-2">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5 overflow-visible"
        >
          <circle
            cx={11}
            cy={13}
            r={8}
            strokeWidth={2}
            className="fill-ember stroke-ember-deep"
          />
          <circle cx={18} cy={6} r={5} className="fill-ink" />
          <text
            x={18}
            y={6}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={7}
            className="fill-cream"
          >
            ✓
          </text>
        </svg>
        Been there
      </li>
    </ul>
  );
}

function FoundMap({ map, android }: { map: PublicMap; android: boolean }) {
  const counts = mapCounts(map);
  return (
    <>
      <h1 className="mt-10 font-display text-[32px] leading-tight text-ink sm:text-4xl">
        {mapTitle(map)}
      </h1>
      {counts.places > 0 ? (
        <>
          <Counters counts={counts} />
          {counts.been > 0 ? <Legend /> : null}
          {map.cities.map(({ city, places }) => (
            <MapCitySection
              key={city}
              city={city}
              places={places}
              android={android}
            />
          ))}
        </>
      ) : (
        <p className="mt-2 text-[15px] text-muted">
          No places on this map yet.
        </p>
      )}
    </>
  );
}

function NoMap({ outcome }: { outcome: PublicMapOutcome }) {
  return (
    <div className="mt-10">
      <h1 className="font-display text-[32px] leading-tight text-ink">
        {outcome === "missing"
          ? "This map isn’t shared anymore"
          : "This map didn’t load"}
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        {outcome === "missing"
          ? "Ask for a new link."
          : "Try again in a moment."}
      </p>
    </div>
  );
}

function MakeYourOwn({ token, android }: { token: string; android: boolean }) {
  if (android) {
    return (
      <div className="mt-12 flex flex-col items-center gap-1 rounded-2xl border border-line bg-card p-4 text-center">
        <p className="text-[15px] font-semibold text-ink">Make your own map</p>
        <AndroidWaitlist source="map" tone="light" />
      </div>
    );
  }
  return (
    <div className="mt-12 flex flex-col items-start gap-3 rounded-2xl border border-line bg-card p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">Make your own map</p>
        <p className="text-sm text-muted">
          Save places from reels and TikToks and see them on your own map.
          Shelvr for iPhone.
        </p>
      </div>
      <AppStoreButton source="map" shareToken={token} compact />
    </div>
  );
}

function ReportLine({ token }: { token: string }) {
  return (
    <p className="mt-6 text-xs text-muted">
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
          `Report Shelvr map page /m/${token}`,
        )}`}
        className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
      >
        Report this page
      </a>{" "}
      or email <span className="select-all">{SUPPORT_EMAIL}</span>
    </p>
  );
}

export default async function PublicMapPage({ params }: PageProps) {
  const { token } = await params;
  const { outcome, map } = await loadPublicMap(token);
  const android = /android/i.test((await headers()).get("user-agent") ?? "");

  return (
    <main className="min-h-screen bg-paper">
      <MapPageView token={token} outcome={outcome} counts={mapCounts(map)} />
      <div className="container max-w-xl py-10 sm:py-16">
        <Logo />
        {map ? (
          <FoundMap map={map} android={android} />
        ) : (
          <NoMap outcome={outcome} />
        )}
        <MakeYourOwn token={token} android={android} />
        {outcome === "unavailable" ? null : <ReportLine token={token} />}
      </div>
    </main>
  );
}
