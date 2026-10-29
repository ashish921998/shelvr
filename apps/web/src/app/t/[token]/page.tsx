import type { Metadata } from "next";
import Logo from "@/components/common/Logo";
import { loadTripShare, tripMapUrl, type SharedTrip } from "@/lib/tripShare";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "A trip shared with you — Shelvr",
  description: "Open the itinerary and find each stop on the map.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Stops({ stops }: { stops: SharedTrip["unplanned"] }) {
  return (
    <ol className="divide-y divide-line">
      {stops.map((stop, index) => (
        <li
          key={`${index}-${stop.name}`}
          className="flex items-center gap-4 py-4"
        >
          <span className="text-sm text-muted">{index + 1}</span>
          <span className="min-w-0 flex-1 font-medium text-ink">
            {stop.name}
          </span>
          <a
            href={tripMapUrl(stop)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full border border-line px-3 py-2 text-sm text-ink"
            aria-label={`Open ${stop.name} in Maps`}
          >
            Maps ↗
          </a>
        </li>
      ))}
    </ol>
  );
}

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await loadTripShare(token);
  return (
    <main className="min-h-screen bg-paper">
      <div className="container max-w-xl py-10 sm:py-16">
        <Logo />
        {result.outcome === "found" ? (
          <>
            <p className="mt-10 text-sm text-muted">A trip shared with you</p>
            <h1 className="mt-2 font-display text-4xl leading-tight text-ink">
              {result.trip.name || result.trip.city}
            </h1>
            <p className="mt-3 text-muted">
              {result.trip.city} · {result.trip.days.length} days
              {result.trip.startDate
                ? ` · Starts ${result.trip.startDate}`
                : ""}
            </p>
            <p className="mt-2 text-sm text-muted">
              View only. Refresh to see the owner’s latest changes.
            </p>
            {result.trip.days.map((stops, index) => (
              <section
                key={index}
                className="mt-8 rounded-2xl border border-line bg-card p-5"
              >
                <h2 className="font-display text-2xl text-ink">
                  Day {index + 1}
                </h2>
                {stops.length ? (
                  <Stops stops={stops} />
                ) : (
                  <p className="mt-3 text-muted">No stops planned yet.</p>
                )}
              </section>
            ))}
            {result.trip.unplanned.length ? (
              <section className="mt-8 rounded-2xl border border-line bg-card p-5">
                <h2 className="font-display text-2xl text-ink">Unplanned</h2>
                <Stops stops={result.trip.unplanned} />
              </section>
            ) : null}
          </>
        ) : (
          <div className="mt-10">
            <h1 className="font-display text-3xl text-ink">
              {result.outcome === "missing"
                ? "This trip is no longer shared"
                : "This trip didn’t load"}
            </h1>
            <p className="mt-3 text-muted">
              {result.outcome === "missing"
                ? "Ask the owner for a new link."
                : "Try refreshing in a moment."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
