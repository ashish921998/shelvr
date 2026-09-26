"use client";

import {
  ChatBubbleLeftIcon,
  DocumentTextIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PencilSquareIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "@/lib/motion";
import { IntentChip, TagChip, type IntentKind } from "./Chips";

type Result = {
  title: string;
  snippet: string;
  Icon: typeof LinkIcon;
  thumb: string;
} & ({ tag: string } | { intent: IntentKind; intentLabel: string });

const QUERIES: { q: string; results: Result[] }[] = [
  {
    q: "lisbon weekend",
    results: [
      {
        title: "A Lisbon weekend itinerary",
        snippet: "…a weekend in Alfama, then the miradouro at 19:40…",
        Icon: DocumentTextIcon,
        thumb: "#c05a3a",
        tag: "trips",
      },
      {
        title: "Miradouro da Senhora do Monte",
        snippet: "Saved from a screenshot · sunset spot",
        Icon: MapPinIcon,
        thumb: "#8d8271",
        intent: "open_maps",
        intentLabel: "Directions",
      },
      {
        title: "Pastéis de nata, ranked",
        snippet: "Manteigaria over the famous one, apparently.",
        Icon: LinkIcon,
        thumb: "#e6a23c",
        tag: "food",
      },
    ],
  },
  {
    q: "that ramen",
    results: [
      {
        title: "Weeknight ramen",
        snippet: "AI summary · 25-min shoyu, soft-boiled eggs",
        Icon: PhotoIcon,
        thumb: "#e6a23c",
        tag: "recipes",
      },
      {
        title: "buy: miso, scallions, good eggs",
        snippet: "Note · Tuesday",
        Icon: PencilSquareIcon,
        thumb: "#9a6416",
        intent: "copy",
        intentLabel: "Copy",
      },
      {
        title: "Ramen shop near the office",
        snippet: "Photo of the shop front · saved in March",
        Icon: MapPinIcon,
        thumb: "#8d8271",
        intent: "open_maps",
        intentLabel: "Directions",
      },
    ],
  },
  {
    q: "café marta mentioned",
    results: [
      {
        title: "the riverside café Marta mentioned",
        snippet: "Note · filed into Places",
        Icon: PencilSquareIcon,
        thumb: "#9a6416",
        intent: "open_maps",
        intentLabel: "Find it",
      },
      {
        title: "Marta · iMessage",
        snippet: "“…it’s the one with the green door by the bridge”",
        Icon: ChatBubbleLeftIcon,
        thumb: "#2b2418",
        tag: "places",
      },
      {
        title: "Porto in two days",
        snippet: "…the café by the Dom Luís bridge does a proper…",
        Icon: DocumentTextIcon,
        thumb: "#c05a3a",
        tag: "trips",
      },
    ],
  },
];

export default function Search() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const [qi, setQi] = useState(0);
  const [typed, setTyped] = useState(0);
  const [out, setOut] = useState(false);
  const { q, results } = QUERIES[qi];

  // Type the query, hold the results, fade out, next query. Only on screen,
  // and never with reduced motion (which shows the first query in full).
  useEffect(() => {
    if (!inView || reduced) return;
    const [delay, step] =
      typed < q.length
        ? [70, () => setTyped(typed + 1)]
        : !out
          ? [2200, () => setOut(true)]
          : [
              350,
              () => {
                setQi((qi + 1) % QUERIES.length);
                setTyped(0);
                setOut(false);
              },
            ];
    const timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [inView, reduced, typed, out, qi, q.length]);

  const fade = out ? "translate-y-2 opacity-0" : "opacity-100";

  return (
    <section
      ref={ref}
      id="find"
      className="mx-auto flex max-w-[1200px] flex-col items-center gap-7 px-5 pt-18 pb-10 text-center"
    >
      <h2 className="font-display max-w-[18ch] text-[clamp(36px,4.4vw,64px)] leading-[.98] text-balance">
        Find it the way you remember it.
      </h2>
      <p className="max-w-[46ch] text-[17px] leading-normal text-pretty text-muted">
        Search whole articles and notes, and find photos by what’s in them.
        Places show up on a map. Every save keeps its AI summary.
      </p>

      <div
        className="flex w-full max-w-[640px] flex-col gap-3 text-left"
        aria-hidden
      >
        <div className="flex h-14 items-center gap-3 rounded-full border-[1.5px] border-ink bg-cream px-5 text-lg font-medium shadow-[4px_4px_0_var(--color-ink)]">
          <MagnifyingGlassIcon className="size-5 flex-none" strokeWidth={2} />
          <span className="truncate">{reduced ? q : q.slice(0, typed)}</span>
          <span className="h-[22px] w-0.5 flex-none bg-ink motion-safe:animate-[blink_1s_steps(1)_infinite]" />
        </div>
        <div
          className={`flex justify-between px-1.5 text-xs font-medium text-muted-soft transition-opacity duration-300 ${out ? "opacity-0" : ""}`}
        >
          <span>{results.length} results · 0.2s</span>
          <span>full text · notes · photos</span>
        </div>
        <div className={`flex flex-col gap-2 transition duration-300 ${fade}`}>
          {results.map((r) => (
            <div
              key={r.title}
              className="flex items-center gap-3.5 rounded-2xl border border-line bg-cream px-3.5 py-3 transition duration-200 hover:translate-x-1 hover:shadow-[0_8px_20px_-8px_rgba(43,36,24,.25)]"
            >
              <div
                className="flex size-12 flex-none items-center justify-center rounded-lg text-paper"
                style={{ background: r.thumb }}
              >
                <r.Icon className="size-5" strokeWidth={2} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <p className="text-[15px] leading-tight font-bold">{r.title}</p>
                <p className="truncate text-xs leading-snug text-muted">
                  {r.snippet}
                </p>
              </div>
              {"intent" in r ? (
                <IntentChip kind={r.intent} label={r.intentLabel} />
              ) : (
                <TagChip label={r.tag} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
