"use client";

import {
  ArrowUturnLeftIcon,
  BookOpenIcon,
  BriefcaseIcon,
  CakeIcon,
  GiftIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IntentChip, TagChip, type IntentKind } from "./Chips";
import styles from "./HeroStage.module.css";

// Three canvases, picked by the same breakpoints as HeroStage.module.css:
// mobile (<760) 400×920, wide (760–999) 960×590, split (≥1000) 672×610.
const COLS = { m: [14, 206], w: [30, 262, 494, 726], s: [24, 182, 340, 498] };
const ROWS = {
  m: [24, 200, 376, 552, 728],
  w: [64, 238, 412],
  s: [64, 246, 428],
};

type Card = {
  title: string;
  h: number;
  col: number;
  row: number;
  /** Messy x, y, rotation on the 960 canvas. */
  mess: [number, number, number];
} & (
  | { kind: "photo"; src: string }
  | { kind: "link"; domain: string; tag: string; dot: string }
  | { kind: "note"; intent: IntentKind; intentLabel: string }
);

const CARDS: Card[] = [
  {
    kind: "photo",
    title: "Weeknight ramen",
    src: "/images/spaces/recipes.jpg",
    h: 110,
    col: 0,
    row: 0,
    mess: [90, 60, -14],
  },
  {
    kind: "note",
    title: "buy: miso, scallions, good eggs",
    intent: "copy",
    intentLabel: "Copy list",
    h: 130,
    col: 0,
    row: 1,
    mess: [700, 300, 9],
  },
  {
    kind: "photo",
    title: "Dashboard screenshot",
    src: "/images/spaces/office.jpg",
    h: 90,
    col: 0,
    row: 2,
    mess: [420, 40, 6],
  },
  {
    kind: "photo",
    title: "Prague someday",
    src: "/images/spaces/prague.jpg",
    h: 110,
    col: 1,
    row: 0,
    mess: [560, 220, -7],
  },
  {
    kind: "link",
    title: "A Lisbon weekend itinerary",
    domain: "theguardian.com",
    tag: "trips",
    dot: "#c05a3a",
    h: 130,
    col: 1,
    row: 1,
    mess: [230, 330, 12],
  },
  {
    kind: "note",
    title: "the riverside café Marta mentioned",
    intent: "open_maps",
    intentLabel: "Find it",
    h: 110,
    col: 1,
    row: 2,
    mess: [40, 380, -5],
  },
  {
    kind: "link",
    title: "The quiet joy of keeping things",
    domain: "every.to",
    tag: "reading list",
    dot: "#2b2418",
    h: 130,
    col: 2,
    row: 0,
    mess: [330, 160, 4],
  },
  {
    kind: "photo",
    title: "Reading list",
    src: "/images/spaces/reading.jpg",
    h: 110,
    col: 2,
    row: 1,
    mess: [760, 60, 15],
  },
  {
    kind: "photo",
    title: "Coffee setup",
    src: "/images/spaces/gifts.jpg",
    h: 110,
    col: 3,
    row: 0,
    mess: [150, 200, -11],
  },
  {
    kind: "note",
    title: "Ana’s birthday, Oct 12",
    intent: "add_event",
    intentLabel: "Oct 12",
    h: 110,
    col: 3,
    row: 1,
    mess: [520, 400, -3],
  },
];

const LABELS = [
  { name: "Recipes", count: 31, tint: "#f0c078", icon: CakeIcon },
  { name: "Trips", count: 14, tint: "#e8b4a0", icon: BriefcaseIcon },
  { name: "Reading list", count: 22, tint: "#d9cfb8", icon: BookOpenIcon },
  { name: "Gift ideas", count: 9, tint: "#e6c9a8", icon: GiftIcon },
];

const move = (x: number, y: number, r: number) =>
  `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${r}deg)`;

/** Every layout's mess and tidy transform, as CSS variables the stylesheet picks between. */
function cardVars(card: Card, i: number) {
  const [x, y, r] = card.mess;
  const tilt = (i % 2 ? 1 : -1) * 0.8;
  const mCol = i % 2;
  const mRow = Math.floor(i / 2);
  return {
    "--md": `${i * 40}ms`,
    "--z": (i % 4) + 1,
    "--h": `${card.h}px`,
    "--h-s": `${Math.round(card.h * 0.85)}px`,
    "--mess-m": move(x * 0.22 + 10, y * 1.6 + 40, r),
    "--mess-w": move(x, y, r),
    "--mess-s": move(x * 0.62 + 10, y * 1.05 + 20, r),
    "--tidy-m": move(COLS.m[mCol], ROWS.m[mRow], tilt),
    "--tidy-w": move(COLS.w[card.col], ROWS.w[card.row], tilt),
    "--tidy-s": move(COLS.s[card.col], ROWS.s[card.row], tilt),
    "--td-m": `${mCol * 240 + mRow * 70}ms`,
    "--td-w": `${card.col * 240 + card.row * 70}ms`,
  } as CSSProperties;
}

function CardBody({ card }: { card: Card }) {
  if (card.kind === "photo") {
    return (
      <div className="flex flex-col gap-[5px] rounded-xl bg-cream px-1.5 pt-1.5 pb-2">
        <div
          className={`${styles.cardHeight} relative overflow-hidden rounded-[7px]`}
        >
          <Image
            src={card.src}
            alt=""
            fill
            sizes="190px"
            className="object-cover"
          />
        </div>
        <p className="truncate px-[3px] text-xs leading-tight font-bold">
          {card.title}
        </p>
      </div>
    );
  }
  const note = card.kind === "note";
  return (
    <div
      className={`${styles.cardHeight} flex flex-col gap-1.5 rounded-xl p-3 ${note ? "bg-ember-soft" : "bg-cream"}`}
    >
      {note ? (
        <p className="text-[10px] font-bold tracking-[0.1em] text-ember-deep">
          NOTE
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
          <span
            className="size-3 rounded-[3px]"
            style={{ background: card.dot }}
          />
          {card.domain}
        </p>
      )}
      <p className="font-display text-base leading-[1.1] tracking-normal">
        {card.title}
      </p>
      <div className={`${styles.chip} mt-auto`}>
        {note ? (
          <IntentChip kind={card.intent} label={card.intentLabel} />
        ) : (
          <TagChip label={card.tag} emphasized />
        )}
      </div>
    </div>
  );
}

/** The hero demo: a pile of saves that files itself onto labelled shelves. */
export default function HeroStage() {
  const [tidy, setTidy] = useState(false);
  const [scale, setScale] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef(() => {});

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const resize = new ResizeObserver(() =>
      setScale(Math.min(1, wrap.clientWidth / canvas.offsetWidth)),
    );
    resize.observe(wrap);

    let current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inView = false;
    let seen = false;
    const set = (next: boolean) => {
      current = next;
      setTidy(next);
    };
    const loop = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!inView) return;
        set(!current);
        loop(current ? 6500 : 2600);
      }, delay);
    };
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    toggleRef.current = () => {
      set(!current);
      if (!reduced) loop(current ? 9000 : 4000);
    };
    if (reduced) {
      set(true);
      return () => resize.disconnect();
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) {
          loop(seen ? 1400 : 2000);
          seen = true;
        } else if (seen) {
          clearTimeout(timer);
          set(false);
        }
      },
      { threshold: 0.45 },
    );
    io.observe(wrap);
    return () => {
      resize.disconnect();
      io.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const label = tidy ? "Make a mess again" : "Let Shelvr file it";

  return (
    <div
      ref={wrapRef}
      onClick={() => toggleRef.current()}
      title={label}
      className={`${styles.wrap} relative w-full max-w-[960px] cursor-pointer justify-self-stretch`}
    >
      <div
        ref={canvasRef}
        data-tidy={tidy}
        className={styles.canvas}
        style={
          scale === null
            ? { visibility: "hidden" }
            : ({ "--s": scale } as CSSProperties)
        }
      >
        <div className={styles.grain} />

        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`${styles.plank} ${styles[`plank${i}`]}`}
            style={{ "--pd": `${120 + i * 90}ms` } as CSSProperties}
          />
        ))}

        {LABELS.map((space, i) => (
          <div
            key={space.name}
            className={`${styles.label} ${styles[`label${i}`]}`}
            style={{ "--ld": `${520 + i * 240}ms` } as CSSProperties}
          >
            <span
              className="flex size-6 flex-none items-center justify-center rounded-full text-ink"
              style={{ background: space.tint }}
            >
              <space.icon aria-hidden className="size-3.5" strokeWidth={2} />
            </span>
            <span
              className={`${styles.labelName} font-display whitespace-nowrap text-dark-text`}
            >
              {space.name}
            </span>
            <span
              className={`${styles.labelCount} text-xs font-medium whitespace-nowrap text-dark-muted`}
            >
              {space.count} saves
            </span>
          </div>
        ))}

        <p
          className={`${styles.messCaption} text-[13px] font-medium text-dark-muted`}
        >
          4,000 screenshots deep. Sound familiar?
        </p>

        {CARDS.map((card, i) => (
          <div
            key={card.title}
            className={styles.card}
            style={cardVars(card, i)}
          >
            <div className={styles.lift}>
              <CardBody card={card} />
            </div>
          </div>
        ))}

        <div
          className={`${styles.counter} flex items-center gap-2 rounded-full border border-dark-line bg-dark-3 px-3 py-1.5 text-xs font-bold text-ember-light`}
        >
          <SparklesIcon
            aria-hidden
            className={`${styles.sparkle} size-3.5`}
            strokeWidth={2}
          />
          10 saves · 4 Spaces · 0 folders
        </div>

        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={(event) => {
            event.stopPropagation();
            toggleRef.current();
          }}
          className="absolute bottom-3.5 left-4 z-[5] flex size-10 items-center justify-center rounded-full border border-dark-line bg-dark-3 text-ember-light transition-colors hover:bg-dark-plank focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
        >
          {tidy ? (
            <ArrowUturnLeftIcon
              aria-hidden
              className="size-[18px]"
              strokeWidth={2}
            />
          ) : (
            <SparklesIcon aria-hidden className="size-[18px]" strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}
