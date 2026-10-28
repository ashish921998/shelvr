"use client";

import { useRef, useState, type ReactNode } from "react";

import type { PlanSharePlace } from "@/lib/planShare";

export type Choice = "pick" | "pass";

/**
 * A shortlist as a deck of photo cards, one place per card, swiped or paged
 * with the arrows, with Skip / I'd go under each. Every card stays in the
 * DOM, so every place's buttons are reachable without paging.
 */
export default function PlanDeck({
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
  const cards = useRef<(HTMLElement | null)[]>([]);
  const pages = places.length + 1;

  const flipTo = (next: number) => {
    const element = track.current;
    const target = Math.max(0, Math.min(pages - 1, next));
    setPage(target);
    // Keep keyboard focus with the page on screen, so Tab reaches its buttons
    // instead of walking into a card that is off screen.
    cards.current[target]?.focus({ preventScroll: true });
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
      <Progress places={places} choices={choices} page={page} />
      <div className="relative mt-4">
        <div
          ref={track}
          role="region"
          aria-label="Shortlist"
          tabIndex={0}
          // Any hand on the track (touch, wheel, keys) can stop a smooth flip
          // short of its target, so the visible card wins again.
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
          className="-mx-2 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth motion-reduce:scroll-auto [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink [&::-webkit-scrollbar]:hidden"
        >
          {places.map((place, index) => (
            <section
              key={place.key}
              ref={(element) => {
                cards.current[index] = element;
              }}
              tabIndex={-1}
              aria-label={`${index + 1} of ${places.length}: ${place.name}`}
              className={SLIDE}
            >
              <PlaceCard place={place} choice={choices[place.key]} />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <VoteButton
                  label={`Not ${place.name}`}
                  active={choices[place.key] === "pass"}
                  onClick={() => choose(index, place.key, "pass")}
                >
                  Skip
                </VoteButton>
                <VoteButton
                  label={`Yes to ${place.name}`}
                  active={choices[place.key] === "pick"}
                  tone="yes"
                  onClick={() => choose(index, place.key, "pick")}
                >
                  I’d go
                </VoteButton>
              </div>
            </section>
          ))}
          <section
            ref={(element) => {
              cards.current[places.length] = element;
            }}
            tabIndex={-1}
            aria-label="End of the shortlist"
            className={SLIDE}
          >
            <SummaryCard picks={picks} total={places.length} />
            <button
              type="button"
              onClick={() => flipTo(0)}
              className="mt-4 h-14 w-full rounded-full border border-line-strong bg-cream text-[15px] font-semibold text-ink transition-colors hover:border-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Go through them again
            </button>
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

const SLIDE =
  "w-full flex-none snap-center rounded-[30px] px-2 pt-1 pb-5 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

// Cards without a photo get one of these, so a run of them still reads as
// different places.
const PLAIN_TONES = ["bg-ember-soft", "bg-paper-deep", "bg-[#efe1d6]"];

function PlaceCard({
  place,
  choice,
}: {
  place: PlanSharePlace;
  choice: Choice | undefined;
}) {
  const photo = Boolean(place.imageUrl);
  const tone =
    PLAIN_TONES[(place.name.codePointAt(0) ?? 0) % PLAIN_TONES.length];
  return (
    <article
      className={`relative flex min-h-[min(52svh,500px)] flex-col justify-end overflow-hidden rounded-[24px] shadow-[0_10px_20px_-12px_rgba(43,36,24,0.5)] ${
        photo ? "bg-ink" : tone
      }`}
    >
      {place.imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 via-55% to-transparent"
          />
        </>
      ) : (
        <span
          aria-hidden="true"
          className="absolute -top-[0.18em] left-5 font-display text-[clamp(180px,58vw,300px)] leading-none text-ember-deep/10 select-none"
        >
          {place.name.slice(0, 1)}
        </span>
      )}

      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
        {place.area ? (
          <span className="flex min-w-0 items-center gap-1 rounded-full bg-cream/90 px-3 py-1.5 text-[13px] font-semibold text-ink backdrop-blur">
            <Pin />
            <span className="truncate">{place.area}</span>
          </span>
        ) : (
          <span />
        )}
        {choice ? <AnswerChip choice={choice} /> : null}
      </div>

      <div
        className={`relative p-5 pt-16 sm:p-6 ${photo ? "text-cream" : "text-ink"}`}
      >
        <h2 className="font-display text-[clamp(30px,8.4vw,40px)] leading-[1.02] tracking-[-0.01em] break-words">
          {place.name}
        </h2>
        <p
          className={`mt-2 text-[15px] leading-[1.45] ${photo ? "text-cream/85" : "text-ink-soft"}`}
        >
          {place.why}
        </p>
      </div>
    </article>
  );
}

function AnswerChip({ choice }: { choice: Choice }) {
  return choice === "pick" ? (
    <span className="flex-none rounded-full bg-ember px-3 py-1.5 text-[13px] font-semibold text-ink">
      ✓ You’d go
    </span>
  ) : (
    <span className="flex-none rounded-full bg-ink/70 px-3 py-1.5 text-[13px] font-semibold text-cream backdrop-blur">
      Skipped
    </span>
  );
}

function SummaryCard({
  picks,
  total,
}: {
  picks: PlanSharePlace[];
  total: number;
}) {
  return (
    <article className="flex min-h-[280px] flex-col rounded-[24px] bg-ink p-6 text-cream shadow-[0_10px_20px_-12px_rgba(43,36,24,0.5)]">
      <p className="font-display text-[clamp(30px,8.4vw,40px)] leading-[1.05]">
        {picks.length === 0
          ? "Nothing yet"
          : `You’d go to ${picks.length} of ${total}`}
      </p>
      {picks.length === 0 ? (
        <p className="mt-2 text-[15px] leading-[1.45] text-cream/75">
          Go back through and tap I’d go on the places you like.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {picks.slice(0, 5).map((place) => (
            <li key={place.key} className="flex items-center gap-3">
              <Thumb place={place} />
              <span className="min-w-0 text-[16px] leading-snug break-words">
                {place.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Thumb({ place }: { place: PlanSharePlace }) {
  return place.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={place.imageUrl}
      alt=""
      className="h-11 w-11 flex-none rounded-xl object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-ember font-display text-xl text-ink"
    >
      {place.name.slice(0, 1)}
    </span>
  );
}

/**
 * One segment per card, like a stories bar: the open card is ink, answered
 * places take the colour of their answer, the rest wait in line.
 */
function Progress({
  places,
  choices,
  page,
}: {
  places: PlanSharePlace[];
  choices: Record<string, Choice>;
  page: number;
}) {
  const tone = (index: number) => {
    if (index === page) return "bg-ink";
    const choice = places[index] ? choices[places[index].key] : undefined;
    if (choice === "pick") return "bg-ember";
    if (choice === "pass") return "bg-muted-soft";
    return "bg-line-strong";
  };
  return (
    <div aria-hidden="true" className="flex gap-1">
      {Array.from({ length: places.length + 1 }, (_, index) => (
        <span
          key={index}
          className={`h-[3px] flex-1 rounded-full transition-colors motion-reduce:transition-none ${tone(index)}`}
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
      className={`absolute top-[40%] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream text-xl text-ink shadow-card transition-opacity hover:bg-white focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-0 sm:flex ${
        side === "left" ? "-left-16" : "-right-16"
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
  children: ReactNode;
}) {
  const style =
    tone === "yes"
      ? active
        ? "bg-ember text-ink"
        : "bg-ink text-cream hover:bg-ink-soft"
      : active
        ? "border border-ink bg-paper-deep text-ink"
        : "border border-line-strong bg-cream text-ink hover:border-ink-soft";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-14 items-center justify-center gap-2 rounded-full text-[16px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${style}`}
    >
      <span aria-hidden="true">{tone === "yes" ? "✓" : "✕"}</span>
      {children}
    </button>
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
      strokeWidth="1.5"
    >
      <path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 0 0-9 0c0 3.6 4.5 7.8 4.5 7.8z" />
      <circle cx="8" cy="6.6" r="1.6" />
    </svg>
  );
}
