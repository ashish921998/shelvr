import { useId } from "react";

import MapSketch from "@/components/map/MapSketch";
import { countLabel, placeLink, type PublicMapPlace } from "@/lib/publicMap";

export default function MapCitySection({
  city,
  places,
  android,
}: {
  city: string;
  places: PublicMapPlace[];
  android: boolean;
}) {
  const headingId = useId();
  const been = places.filter((place) => place.went).length;

  return (
    <section aria-labelledby={headingId} className="mt-12">
      <h2
        id={headingId}
        className="font-display text-[26px] leading-tight text-ink"
      >
        {city}
      </h2>
      <p className="mt-1 text-[15px] text-muted">
        {countLabel(places.length, "place", "places")}
        {been > 0 ? ` · ${been} been there` : ""}
      </p>
      <div className="mt-4">
        <MapSketch city={city} places={places} />
      </div>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {places.map((place, index) => {
          const link = placeLink(place, city, android);
          return (
            <li
              key={`${index}:${place.name}`}
              className="flex items-start gap-3 px-4 py-3"
            >
              <span
                aria-hidden="true"
                className="flex h-6 w-6 flex-none items-center justify-center text-lg leading-none"
              >
                {place.emoji ?? ""}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-6 text-ink [overflow-wrap:anywhere]">
                  {place.name}
                  {place.went ? (
                    <span className="ml-2 inline-block rounded-full bg-ember-soft px-2 py-0.5 align-middle text-xs font-semibold leading-4 text-ink">
                      Been there
                    </span>
                  ) : null}
                </p>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer ugc"
                  className="mt-0.5 inline-flex min-h-6 items-center gap-1 text-sm font-medium text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {link.label}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
