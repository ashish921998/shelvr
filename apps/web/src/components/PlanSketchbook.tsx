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
  const spreads = useRef<(HTMLElement | null)[]>([]);
  const pages = places.length + 1;

  const flipTo = (next: number) => {
    const element = track.current;
    const target = Math.max(0, Math.min(pages - 1, next));
    setPage(target);
    // Keep keyboard focus with the page on screen, so Tab reaches its buttons
    // instead of walking into a spread that is off screen.
    spreads.current[target]?.focus({ preventScroll: true });
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
          // Any hand on the track (touch, wheel, keys) can stop a smooth flip
          // short of its target, so the visible spread wins again.
          onPointerDown={() => {
            flipping.current = null;
          }}
          onWheel={() => {
            flipping.current = null;
          }}
          onKeyDown={() => {
            flipping.current = null;
          }}
          onScroll={(event) =>
            onScroll(
              event.currentTarget.scrollLeft,
              event.currentTarget.clientWidth,
            )
          }
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth motion-reduce:scroll-auto [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink [&::-webkit-scrollbar]:hidden"
        >
          {places.map((place, index) => (
            <section
              key={place.key}
              ref={(element) => {
                spreads.current[index] = element;
              }}
              tabIndex={-1}
              aria-label={`${index + 1} of ${places.length}: ${place.name}`}
              className={SPREAD}
            >
              <Spread place={place} />
              <div className="mt-6 flex justify-center gap-10">
                <VoteButton
                  label={`Not ${place.name}`}
                  caption="Skip"
                  active={choices[place.key] === "pass"}
                  onClick={() => choose(index, place.key, "pass")}
                >
                  ✕
                </VoteButton>
                <VoteButton
                  label={`Yes to ${place.name}`}
                  caption="I'd go"
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
            ref={(element) => {
              spreads.current[places.length] = element;
            }}
            tabIndex={-1}
            aria-label="End of the shortlist"
            className={SPREAD}
          >
            <EndSpread picks={picks} total={places.length} />
            <div className="mt-6 flex justify-center">
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
      <PageDots places={places} choices={choices} page={page} />
    </div>
  );
}

const SPREAD =
  "w-full flex-none snap-center rounded-[18px] px-2 pt-1 pb-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

// The dot grid printed on a sketchbook page.
const DOT_GRID = {
  backgroundImage:
    "radial-gradient(circle, var(--color-line-strong) 0.9px, transparent 1.2px)",
  backgroundSize: "14px 14px",
  backgroundPosition: "7px 7px",
};

/**
 * An open hardback sketchbook: cream pages on a deep ember cover, a shadowed
 * spine, and a ribbon bookmark hanging out of the bottom.
 */
function Notebook({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[460px] pb-4">
      <div className="relative grid aspect-[3/2] grid-cols-2 rounded-[16px] bg-ember-deep p-[5px] pb-[11px] shadow-[0_14px_24px_-14px_rgba(43,36,24,0.55)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[7px] bottom-[5px] h-[8px] rounded-b-[10px] bg-[repeating-linear-gradient(to_bottom,var(--color-cream)_0_1px,var(--color-line-strong)_1px_2px)]"
        />
        <div className="relative flex items-center justify-center rounded-l-[11px] bg-cream p-[8%]">
          {left}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-ink/15 to-transparent"
          />
        </div>
        <div
          className="relative flex flex-col justify-center gap-2 rounded-r-[11px] bg-cream p-[9%] text-ink"
          style={DOT_GRID}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-ink/10 to-transparent"
          />
          {right}
        </div>
        <Ribbon />
      </div>
    </div>
  );
}

function Ribbon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute top-0 left-[calc(50%-18px)] h-[calc(100%+14px)] w-2.5"
    >
      <path d="M0 0h10v100l-5-6-5 6z" className="fill-terracotta" />
    </svg>
  );
}

function Spread({ place }: { place: PlanSharePlace }) {
  return (
    <Notebook
      left={
        place.imageUrl ? (
          <div className="relative w-[84%] -rotate-3 bg-white p-1.5 pb-5 shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={place.imageUrl}
              alt=""
              className="aspect-square w-full object-cover"
            />
            <Tape />
          </div>
        ) : (
          <span
            aria-hidden="true"
            className="font-display text-[clamp(64px,22vw,120px)] leading-none text-ember-deep"
          >
            {Array.from(place.name)[0] ?? ""}
          </span>
        )
      }
      right={
        <>
          <h2 className="font-display text-[clamp(21px,5.8vw,30px)] leading-[1.02] break-words">
            {place.name}
          </h2>
          <InkUnderline />
          <p className="text-[clamp(12px,3.4vw,14px)] leading-snug text-ink-soft">
            {place.why}
          </p>
          {place.area ? (
            <p className="mt-1 flex items-center gap-1 text-[clamp(11px,3vw,13px)] text-muted">
              <Pin />
              <span className="truncate">{place.area}</span>
            </p>
          ) : null}
        </>
      }
    />
  );
}

/** A strip of washi tape holding the photo to the page. */
function Tape() {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-2.5 left-1/2 h-5 w-14 -translate-x-1/2 rotate-[4deg] bg-ember-light/70"
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
        <span className="flex flex-col items-center text-ink">
          <span className="font-display text-[clamp(56px,18vw,96px)] leading-none">
            {picks.length}
          </span>
          <span className="mt-1 text-[clamp(11px,3vw,13px)] text-muted">
            of {total} {total === 1 ? "place" : "places"}
          </span>
        </span>
      }
      right={
        <>
          <h2 className="font-display text-[clamp(21px,5.8vw,30px)] leading-[1.02] break-words">
            {picks.length === 0 ? "No yeses yet" : "Your yeses"}
          </h2>
          <InkUnderline />
          {picks.length === 0 ? (
            <p className="text-[clamp(12px,3.4vw,14px)] leading-snug text-ink-soft">
              Flip back and tap ✓ on the places you&apos;d go to.
            </p>
          ) : (
            <ul className="space-y-0.5 text-[clamp(12px,3.4vw,14px)] leading-snug text-ink-soft">
              {picks.slice(0, 5).map((place) => (
                <li key={place.key} className="break-words">
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

/**
 * One dot per page: the open page is a bar, and answered places take the
 * colour of their answer, so the voter sees what's left at a glance.
 */
function PageDots({
  places,
  choices,
  page,
}: {
  places: PlanSharePlace[];
  choices: Record<string, Choice>;
  page: number;
}) {
  const tone = (index: number) => {
    if (index === page) return "w-5 bg-ink";
    const choice = places[index] ? choices[places[index].key] : undefined;
    if (choice === "pick") return "w-2 bg-ember";
    if (choice === "pass") return "w-2 bg-muted-soft";
    return "w-2 bg-line-strong";
  };
  return (
    <div
      aria-hidden="true"
      className="mt-4 flex items-center justify-center gap-1.5"
    >
      {Array.from({ length: places.length + 1 }, (_, index) => (
        <span
          key={index}
          className={`h-2 rounded-full transition-all motion-reduce:transition-none ${tone(index)}`}
        />
      ))}
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
      className={`absolute top-[30%] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-cream text-xl text-ink-soft transition-opacity hover:text-ink focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-0 sm:flex ${
        side === "left" ? "-left-14" : "-right-14"
      }`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}

function VoteButton({
  label,
  caption,
  active,
  tone = "no",
  onClick,
  children,
}: {
  label: string;
  caption: string;
  active: boolean;
  tone?: "yes" | "no";
  onClick: () => void;
  children: string;
}) {
  const idle =
    tone === "yes"
      ? "border-ember-deep/40 bg-cream text-ember-deep hover:border-ember-deep"
      : "border-line-strong bg-cream text-muted hover:text-ink";
  const on =
    tone === "yes"
      ? "border-transparent bg-ember text-ink"
      : "border-transparent bg-ink-soft text-cream";
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] text-2xl font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink ${
          active ? on : idle
        }`}
      >
        {children}
        {active ? <InkOval /> : null}
      </button>
      <span
        aria-hidden="true"
        className={`text-[13px] font-semibold ${active ? "text-ink" : "text-muted"}`}
      >
        {caption}
      </span>
    </div>
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
      className="h-2 w-16 text-ember-deep"
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

function Pin() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 0 0-9 0c0 3.6 4.5 7.8 4.5 7.8z" />
      <circle cx="8" cy="6.6" r="1.6" />
    </svg>
  );
}
