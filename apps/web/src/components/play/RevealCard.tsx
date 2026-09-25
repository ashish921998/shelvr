import type { ReactNode } from "react";

import { LENSES } from "@/lib/reveal/lenses";
import { byLens, type LensTable, type Reveal } from "@/lib/reveal/schema";

const CONFIDENCE_CHIP = {
  high: "bg-ember text-ink",
  medium: "bg-ember-soft text-ember-deep",
  low: "bg-paper-deep text-muted",
} as const;

const BODIES: LensTable<ReactNode> = {
  era: (r) => (
    <>
      <h2 className="display text-4xl leading-tight text-ink sm:text-5xl">
        {r.title}
      </h2>
      <p className="mt-4 text-base leading-7 text-ink-soft">{r.tagline}</p>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        The evidence
      </p>
      <ul className="mt-3 space-y-2">
        {r.evidence.map((line, index) => (
          <li
            key={index}
            className="rounded-2xl bg-paper px-4 py-3 text-[15px] leading-6 text-ink"
          >
            {line}
          </li>
        ))}
      </ul>
    </>
  ),
  roast: (r) => (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {r.heat === "spicy" ? "Spicy" : "Gentle"} roast
      </p>
      <ol className="mt-4 space-y-4">
        {r.lines.map((line, index) => (
          <li
            key={index}
            className="display text-2xl leading-snug text-ink sm:text-[1.7rem]"
          >
            {line}
          </li>
        ))}
      </ol>
      <p className="mt-6 border-t border-line pt-5 text-base font-medium text-ember-deep">
        {r.closer}
      </p>
    </>
  ),
  taste: (r) => (
    <>
      <h2 className="display text-4xl leading-tight text-ink sm:text-5xl">
        {r.label}
      </h2>
      <p className="mt-4 text-base leading-7 text-ink-soft">{r.description}</p>
      <div className="mt-6 flex h-16 overflow-hidden rounded-2xl border border-line">
        {r.palette.map((color, index) => (
          <span
            key={index}
            className="flex-1"
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <ul className="mt-5 flex flex-wrap gap-2">
        {r.keywords.map((keyword, index) => (
          <li
            key={index}
            className="rounded-full border border-line-strong px-3 py-1 text-sm text-ink"
          >
            {keyword}
          </li>
        ))}
      </ul>
    </>
  ),
  find: (r) => (
    <ul className="space-y-4">
      {r.matches.map((match, index) => (
        <li key={index} className="rounded-2xl bg-paper p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {match.kind}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CONFIDENCE_CHIP[match.confidence]}`}
            >
              {match.confidence} confidence
            </span>
          </div>
          <h2 className="display mt-2 text-2xl leading-snug text-ink">
            {match.guess}
          </h2>
          <p className="mt-2 text-[15px] leading-6 text-ink-soft">
            {match.check}
          </p>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(match.searchQuery)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-ember-deep underline decoration-ember/50 underline-offset-4 hover:text-ink"
          >
            Search “{match.searchQuery}” →
          </a>
        </li>
      ))}
    </ul>
  ),
};

export default function RevealCard({ reveal }: { reveal: Reveal }) {
  return (
    <article className="soft-card rounded-3xl p-6 sm:p-8">
      <p className="section-kicker">{LENSES[reveal.lens].name}</p>
      <div className="mt-4 break-words">{byLens(BODIES, reveal)}</div>
      <p className="mt-8 text-xs font-medium text-muted-soft">shelvr</p>
    </article>
  );
}
