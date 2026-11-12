"use client";

import { ArrowUpRightIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { FormEvent, useState } from "react";

import MapCta from "@/components/MapCta";
import PlaceSketch from "@/components/tools/PlaceSketch";
import { captureWebAnalyticsEvent } from "@/lib/analytics";
import {
  SAMPLE_PLACES,
  appleMapsUrl,
  googleMapsUrl,
  parseReelLink,
  parseReelPlaces,
  type ReelPlaces,
} from "@/lib/reelPlaces";

type Loaded = { found: ReelPlaces; sample: boolean };

const BAD_LINK =
  "That doesn’t look like an Instagram or TikTok link. Copy it from the share menu and paste it here.";

export default function ReelPlaceFinder() {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  async function find(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const url = parseReelLink(link);
    if (!url) {
      setProblem(BAD_LINK);
      setLoaded(null);
      return;
    }
    setBusy(true);
    setProblem(null);
    setLoaded(null);
    try {
      const response = await fetch("/api/reel-places", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (response.status === 429) {
        setProblem("Lots of people are using this right now. Try again soon.");
        captureWebAnalyticsEvent("place_tool_failed", { reason: "busy" });
        return;
      }
      if (response.status === 400 || response.status === 422) {
        setProblem("Couldn’t read that link. Check it and try again.");
        captureWebAnalyticsEvent("place_tool_failed", { reason: "unreadable" });
        return;
      }
      const found = response.ok
        ? parseReelPlaces(await response.json())
        : undefined;
      if (!found) {
        setProblem("The finder is having trouble. Try again in a moment.");
        captureWebAnalyticsEvent("place_tool_failed", {
          reason: "unavailable",
        });
        return;
      }
      setLoaded({ found, sample: false });
      captureWebAnalyticsEvent("place_tool_result", {
        count: found.places.length,
      });
    } catch {
      setProblem("Couldn’t reach the finder. Try again in a moment.");
      captureWebAnalyticsEvent("place_tool_failed", { reason: "network" });
    } finally {
      setBusy(false);
    }
  }

  function trySample() {
    setProblem(null);
    setLoaded({ found: SAMPLE_PLACES, sample: true });
    captureWebAnalyticsEvent("place_tool_sample_opened");
  }

  return (
    <div className="mt-8">
      <form
        noValidate
        onSubmit={(event) => void find(event)}
        className="rounded-3xl border border-line bg-cream p-5 sm:p-6"
      >
        <label htmlFor="reel-link" className="text-sm font-bold">
          Instagram reel or TikTok link
        </label>
        <input
          id="reel-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://www.instagram.com/reel/…"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          aria-describedby={problem ? "reel-problem" : undefined}
          className="mt-2 block min-h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
        />
        {problem && (
          <p
            id="reel-problem"
            role="alert"
            className="mt-3 text-sm text-ember-deep"
          >
            {problem}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-ink px-6 text-base font-bold text-white transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          >
            {busy ? "Reading the reel…" : "Find the places"}
          </button>
          <button
            type="button"
            onClick={trySample}
            disabled={busy}
            className="min-h-12 text-base font-bold text-ember-deep underline underline-offset-4 disabled:opacity-60"
          >
            Try a sample
          </button>
        </div>
        <p className="mt-4 flex items-start gap-2 text-sm text-muted">
          <LockClosedIcon aria-hidden className="mt-0.5 size-4 flex-none" />
          No login. The link is read once to find the places and isn’t stored.
        </p>
      </form>

      <div aria-live="polite">{loaded && <Results loaded={loaded} />}</div>
    </div>
  );
}

function Results({ loaded }: { loaded: Loaded }) {
  const { found, sample } = loaded;
  const count = found.places.length;
  return (
    <section className="mt-6">
      {sample && (
        <p className="mb-3 inline-block rounded-full bg-ember-soft px-3 py-1 text-xs font-bold text-ember-deep">
          Sample, not a real reel
        </p>
      )}
      {count === 0 ? (
        <div className="rounded-3xl border border-line bg-cream p-6">
          <h2 className="font-display text-[28px] leading-tight">
            No places found
          </h2>
          <p className="mt-2 text-base text-muted">
            The caption doesn’t name any. Many reels only say the place out loud
            or show it on screen, and the finder reads the caption.
          </p>
        </div>
      ) : (
        <>
          <h2 className="font-display text-[32px] leading-tight sm:text-[40px]">
            {count} {count === 1 ? "place" : "places"}
            {found.city ? ` in ${found.city}` : ""}
          </h2>
          <ol className="mt-4 border-t border-line">
            {found.places.map((place, i) => (
              <li
                key={`${place.name}-${i}`}
                className="flex items-start gap-4 border-b border-line py-4"
              >
                <span
                  aria-hidden
                  className="flex size-8 flex-none items-center justify-center rounded-full bg-ember-soft text-sm font-bold text-ember-deep"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-bold text-pretty">
                    {place.name}
                  </p>
                  {place.city && (
                    <p className="text-sm text-muted">{place.city}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-5 text-sm font-bold">
                    <a
                      href={appleMapsUrl(place)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-8 items-center gap-1 text-ember-deep underline underline-offset-4"
                    >
                      Apple Maps
                      <ArrowUpRightIcon aria-hidden className="size-3.5" />
                    </a>
                    <a
                      href={googleMapsUrl(place)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-8 items-center gap-1 text-ember-deep underline underline-offset-4"
                    >
                      Google Maps
                      <ArrowUpRightIcon aria-hidden className="size-3.5" />
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <PlaceSketch places={found.places} />
          <SaveCard city={found.city} sample={sample} />
        </>
      )}
    </section>
  );
}

function SaveCard({ city, sample }: { city?: string; sample: boolean }) {
  return (
    <div className="mt-4 rounded-3xl bg-ink px-6 py-7 text-center text-white sm:px-8">
      <p className="font-display text-2xl sm:text-3xl">
        {city ? `Put these on your ${city} map.` : "Put these on your map."}
      </p>
      <p className="mx-auto mt-2 max-w-[34ch] text-[15px] leading-normal text-white/70">
        {`Get Shelvr, then share ${sample ? "a" : "this"} reel to it. Its places land under their city, ready for a date night or a trip.`}
      </p>
      <div className="mt-5">
        <MapCta source="place_tool" />
      </div>
      <p className="mt-3 text-[13px] text-white/60">
        On the App Store, for iPhone.
      </p>
    </div>
  );
}
