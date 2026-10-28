"use client";

import { useRef, useState, type ReactNode } from "react";

import type { PlanSharePlace } from "@/lib/planShare";

export type Choice = "pick" | "pass";

/**
 * A shortlist laid out as a sketchbook: one place per two-page spread, flipped
 * by swiping or the arrows, with ✓ / ✕ under each spread. Every spread stays in
 * the DOM, so every place's buttons are reachable without flipping.
 */
export default function PlanSketchbook({
  places,
  choices,
  onChoose,
}: {
  places: PlanSharePlace[];
  choices: Record<string, Choice>;
  onChoose: (key: string, choice: Choice) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  // The page a flip is smooth-scrolling to. Until the track reaches it, scroll
  // events still read the old page and must not move `page` back.
  const flipping = useRef<number | null>(null);
  const pages = places.length + 1;

  const flipTo = (next: number) => {
    const element = track.current;
    const target = Math.max(0, Math.min(pages - 1, next));
    setPage(target);
    if (!element?.scrollTo) return;
    flipping.current = target;
    element.scrollTo({ left: target * element.clientWidth });
  };

  const onScroll = (scrollLeft: number, clientWidth: number) => {
    if (clientWidth <= 0) return;
    const shown = Math.round(scrollLeft / clientWidth);
    if (flipping.current !== null) {
      if (Math.abs(scrollLeft - flipping.current * clientWidth) > 1) return;
      flipping.current = null;
    }
    setPage(shown);
  };

  const choose = (index: number, key: string, choice: Choice) => {
    const turningOn = choices[key] !== choice;
    onChoose(key, choice);
    if (turningOn) flipTo(index + 1);
  };

  const picks = places.filter((place) => choices[place.key] === "pick");

  return (
    <div>
      <div className="relative">
        <div
          ref={track}
          role="region"
          aria-label="Shortlist"
          tabIndex={0}
          onPointerDown={() => {
            flipping.current = null;
          }}
          onScroll={(event) =>
            onScroll(
              event.currentTarget.scrollLeft,
              event.currentTarget.clientWidth,
            )
          }
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink [&::-webkit-scrollbar]:hidden"
        >
          {places.map((place, index) => (
            <section
              key={place.key}
              aria-label={`${index + 1} of ${places.length}: ${place.name}`}
              className="w-full flex-none snap-center px-2 pt-1 pb-2"
            >
              <Spread place={place} />
              <Captions
                left={place.area}
                right={`${index + 1} / ${places.length}`}
              />
              <div className="mt-4 flex justify-center gap-6">
                <VoteButton
                  label={`Not ${place.name}`}
                  active={choices[place.key] === "pass"}
                  onClick={() => choose(index, place.key, "pass")}
                >
                  ✕
                </VoteButton>
                <VoteButton
                  label={`Yes to ${place.name}`}
                  active={choices[place.key] === "pick"}
                  tone="yes"
                  onClick={() => choose(index, place.key, "pick")}
                >
                  ✓
                </VoteButton>
              </div>
            </section>
          ))}
          <section
            aria-label="End of the shortlist"
            className="w-full flex-none snap-center px-2 pt-1 pb-2"
          >
            <EndSpread picks={picks} total={places.length} />
            <Captions note="That's the lot" right={`${pages - 1} places`} />
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => flipTo(0)}
                className="h-11 rounded-full border border-line-strong bg-cream px-5 text-sm font-semibold text-ink transition-colors hover:border-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Flip back to the start
              </button>
            </div>
          </section>
        </div>

        <FlipButton
          side="left"
          disabled={page === 0}
          onClick={() => flipTo(page - 1)}
        />
        <FlipButton
          side="right"
          disabled={page >= pages - 1}
          onClick={() => flipTo(page + 1)}
        />
      </div>
    </div>
  );
}

function Notebook({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="mx-auto grid aspect-[3/2] w-full max-w-[460px] grid-cols-2 overflow-hidden rounded-[14px] bg-ember shadow-[0_10px_20px_-12px_rgba(43,36,24,0.45)]">
      <div className="relative flex items-center justify-center p-[7%]">
        {left}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/15 to-transparent"
        />
      </div>
      <div className="relative flex min-h-0 flex-col justify-center gap-2 overflow-hidden p-[8%] text-ink">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/10 to-transparent"
        />
        {right}
      </div>
    </div>
  );
}

function Spread({ place }: { place: PlanSharePlace }) {
  return (
    <Notebook
      left={
        place.imageUrl ? (
          <div className="w-[82%] -rotate-3 bg-cream p-1.5 pb-4 shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={place.imageUrl}
              alt=""
              className="aspect-square w-full object-cover"
            />
          </div>
        ) : (
          <span
            aria-hidden="true"
            className="font-display text-[clamp(64px,22vw,120px)] leading-none text-ink"
          >
            {place.name.slice(0, 1)}
          </span>
        )
      }
      right={
        <>
          <h2 className="line-clamp-3 font-display text-[clamp(20px,5.6vw,28px)] leading-[1.05] break-words">
            {place.name}
          </h2>
          <InkUnderline />
          <p className="line-clamp-4 text-[clamp(12px,3.4vw,14px)] leading-snug">
            {place.why}
          </p>
        </>
      }
    />
  );
}

function EndSpread({
  picks,
  total,
}: {
  picks: PlanSharePlace[];
  total: number;
}) {
  return (
    <Notebook
      left={
        <span
          aria-hidden="true"
          className="font-display text-[clamp(56px,18vw,96px)] leading-none text-ink"
        >
          {picks.length}/{total}
        </span>
      }
      right={
        <>
          <h2 className="line-clamp-3 font-display text-[clamp(20px,5.6vw,28px)] leading-[1.05] break-words">
            {picks.length === 0 ? "No yeses yet" : "Your yeses"}
          </h2>
          <InkUnderline />
          {picks.length === 0 ? (
            <p className="text-[clamp(12px,3.4vw,14px)] leading-snug">
              Flip back and tap ✓ on the places you&apos;d go to.
            </p>
          ) : (
            <ul className="space-y-0.5 text-[clamp(12px,3.4vw,14px)] leading-snug">
              {picks.slice(0, 5).map((place) => (
                <li key={place.key} className="truncate">
                  ✓ {place.name}
                </li>
              ))}
            </ul>
          )}
        </>
      }
    />
  );
}

function Captions({
  left,
  note,
  right,
}: {
  left?: string;
  note?: string;
  right: string;
}) {
  return (
    <div className="mx-auto mt-3 flex w-full max-w-[460px] items-center justify-between gap-3 px-1 text-[13px]">
      <span className="flex min-w-0 items-center gap-1.5 text-muted">
        {left ? (
          <>
            <Globe />
            <span className="truncate">{left}</span>
          </>
        ) : (
          note
        )}
      </span>
      <span className="flex-none font-semibold text-ink">{right}</span>
    </div>
  );
}

function FlipButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous page" : "Next page"}
      disabled={disabled}
      onClick={onClick}
      className={`absolute top-[32%] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-2xl text-ink-soft transition-opacity hover:text-ink focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-0 sm:flex ${
        side === "left" ? "-left-12" : "-right-12"
      }`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}

function VoteButton({
  label,
  active,
  tone = "no",
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  tone?: "yes" | "no";
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`relative flex h-14 w-14 items-center justify-center rounded-full border text-2xl font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink ${
        active
          ? `border-transparent text-ink ${tone === "yes" ? "bg-ember-soft" : "bg-paper-deep"}`
          : "border-line-strong bg-cream text-muted hover:text-ink"
      }`}
    >
      {children}
      {active ? <InkOval /> : null}
    </button>
  );
}

/** The hand-drawn ring Shelvr's sketchbook puts around a chosen answer. */
function InkOval() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 56"
      className="pointer-events-none absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)] overflow-visible"
    >
      <path
        d="M34 4C17 2 4 13 5 28c1 15 15 24 30 23 15-1 25-11 24-24C58 13 46 5 30 6 22 7 15 10 11 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        pathLength={1}
        className="ink-draw"
      />
    </svg>
  );
}

function InkUnderline() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 8"
      className="h-2 w-16 text-ink"
      preserveAspectRatio="none"
    >
      <path
        d="M2 5c18-3 38-4 58-2s40 2 58-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Globe() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <circle cx="8" cy="8" r="6.3" />
      <path d="M1.8 8h12.4M8 1.7c2 2 2 10.6 0 12.6M8 1.7c-2 2-2 10.6 0 12.6" />
    </svg>
  );
}
