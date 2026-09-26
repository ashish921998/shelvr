"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "@/lib/motion";
import { Eyebrow } from "./Chips";

const DECK = [
  { src: "/images/features/tidy.jpg", title: "Night sky", date: "Aug 3" },
  {
    src: "/images/features/search-grid.jpg",
    title: "Screenshot",
    date: "Sep 21",
  },
  {
    src: "/images/features/detail-hero.jpg",
    title: "Lisbon article",
    date: "Sep 12",
  },
  { src: "/images/spaces/trips.jpg", title: "Riverside city", date: "Jul 30" },
];

type Direction = "left" | "right";

function cardTransform(pos: number, swipe: Direction | null) {
  if (pos === 0 && swipe) {
    return swipe === "right"
      ? "translate(340px,-40px) rotate(18deg)"
      : "translate(-340px,-40px) rotate(-18deg)";
  }
  const x = pos ? (pos % 2 ? 14 : -12) * pos : 0;
  const r = pos ? (pos % 2 ? 5 : -4) * pos : 0;
  return `translate(${x}px, ${pos * -8}px) scale(${1 - pos * 0.04}) rotate(${r}deg)`;
}

export default function PhotoTidy() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState(0);
  const [swipe, setSwipe] = useState<Direction | null>(null);

  const doSwipe = (dir: Direction) => {
    if (!swipe) setSwipe(dir);
  };

  // A swipe flies the top card off, then the deck advances.
  useEffect(() => {
    if (!swipe) return;
    const timer = setTimeout(() => {
      setSwipe(null);
      setIndex((i) => i + 1);
      if (swipe === "right") setKept((k) => k + 1);
    }, 750);
    return () => clearTimeout(timer);
  }, [swipe]);

  // Auto-swipe, alternating right and left, only while on screen.
  useEffect(() => {
    if (!inView || reduced || swipe) return;
    const timer = setTimeout(
      () => setSwipe(index % 2 ? "left" : "right"),
      2050,
    );
    return () => clearTimeout(timer);
  }, [inView, reduced, swipe, index]);

  const reviewed = index + 12;
  const percent = `${((reviewed / 4000) * 100).toFixed(1)}%`;

  return (
    <section
      ref={ref}
      id="tidy"
      className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-center gap-10 px-5 pt-18 pb-10"
    >
      <div
        className="order-1 flex justify-center min-[760px]:order-none"
        aria-hidden
      >
        <div className="relative h-[360px] w-[260px]">
          {DECK.map((card, i) => {
            const pos = (((i - index) % 4) + 4) % 4;
            const flying = pos === 0 && swipe !== null;
            return (
              <div
                key={card.src}
                className="absolute inset-0 flex flex-col gap-2 rounded-[18px] bg-cream p-2 shadow-[0_20px_40px_-10px_rgba(43,36,24,.35)] transition-[transform,opacity] duration-[700ms,500ms] ease-[cubic-bezier(.2,.8,.2,1)]"
                style={{
                  transform: cardTransform(pos, swipe),
                  opacity: pos < 3 && !flying ? 1 : 0,
                  zIndex: 10 - pos,
                }}
              >
                <div className="relative h-[290px] overflow-hidden rounded-xl">
                  <Image
                    src={card.src}
                    alt=""
                    fill
                    sizes="244px"
                    className="object-cover"
                  />
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[13px] font-bold">{card.title}</span>
                  <span className="text-[11px] text-muted">{card.date}</span>
                </div>
              </div>
            );
          })}
          {swipe ? (
            <div
              className={`absolute top-1/2 left-1/2 z-10 rounded-full border-[1.5px] border-ink px-[18px] py-2.5 text-base font-bold whitespace-nowrap motion-safe:animate-[stamp_.3s_cubic-bezier(.2,.9,.3,1.2)_both] ${
                swipe === "right"
                  ? "bg-ink text-paper"
                  : "bg-paper-deep text-ink"
              }`}
              style={{
                ["--r" as string]: swipe === "right" ? "6deg" : "-6deg",
                transform: "translate(-50%,-50%) rotate(var(--r))",
              }}
            >
              {swipe === "right" ? "shelve → Ideas" : "let it go"}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Eyebrow>Photo tidy</Eyebrow>
        <h2 className="font-display text-[clamp(36px,4.4vw,64px)] leading-[.98] text-balance">
          Your camera roll, one photo at a time.
        </h2>
        <p className="max-w-[42ch] text-[17px] leading-normal text-pretty text-muted">
          Shelvr walks you through the screenshots you forgot about. Keep it,
          shelve it into a Space, or let it go. The ones worth keeping become
          searchable like everything else.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => doSwipe("left")}
            className="inline-flex h-11 items-center gap-2 rounded-[11px] border border-line bg-cream px-4 text-sm font-bold transition-colors hover:bg-line"
          >
            <ChevronLeftIcon
              aria-hidden
              className="size-3.5"
              strokeWidth={2.5}
            />
            let it go
          </button>
          <button
            type="button"
            onClick={() => doSwipe("right")}
            className="inline-flex h-11 items-center gap-2 rounded-[11px] border border-ink bg-ink px-4 text-sm font-bold text-paper transition-colors hover:bg-ember-deep"
          >
            shelve it
            <ChevronRightIcon
              aria-hidden
              className="size-3.5"
              strokeWidth={2.5}
            />
          </button>
          <span className="ml-1 text-[13px] font-medium text-muted">
            Try it, or let it run.
          </span>
        </div>
        <div className="flex max-w-[320px] flex-col gap-1.5">
          <div className="flex justify-between text-xs font-medium text-muted">
            <span>
              {reviewed} of 4,000 reviewed · {kept + 5} shelved
            </span>
            <span>{percent}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-paper-deep">
            <div
              className="h-full min-w-1.5 rounded-[3px] bg-ember transition-[width] duration-600"
              style={{ width: percent }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
