import Image from "next/image";
import { Eyebrow, SuggestedBadge, TagChip } from "./Chips";

type Book = {
  title: string;
  w: number;
  h: number;
  bg: string;
  fg: string;
  lean?: number;
};

const SHELVES: { name: string; count: number; src: string; books: Book[] }[] = [
  {
    name: "Recipes",
    count: 31,
    src: "/images/spaces/recipes.jpg",
    books: [
      { title: "weeknight ramen", w: 34, h: 104, bg: "#e6a23c", fg: "#2b2418" },
      { title: "cacio e pepe", w: 28, h: 92, bg: "#c05a3a", fg: "#faf6ee" },
      {
        title: "the only vinaigrette",
        w: 40,
        h: 110,
        bg: "#2b2418",
        fg: "#faf6ee",
        lean: -6,
      },
      { title: "dad’s chili", w: 30, h: 84, bg: "#f7e8cd", fg: "#2b2418" },
    ],
  },
  {
    name: "Trips",
    count: 14,
    src: "/images/spaces/trips.jpg",
    books: [
      { title: "lisbon weekend", w: 36, h: 100, bg: "#2b2418", fg: "#faf6ee" },
      { title: "prague someday", w: 30, h: 116, bg: "#e6a23c", fg: "#2b2418" },
      {
        title: "kyoto in november",
        w: 28,
        h: 90,
        bg: "#8d8271",
        fg: "#faf6ee",
        lean: -5,
      },
    ],
  },
  {
    name: "Reading list",
    count: 22,
    src: "/images/spaces/reading.jpg",
    books: [
      {
        title: "the quiet joy of keeping things",
        w: 32,
        h: 112,
        bg: "#c05a3a",
        fg: "#faf6ee",
      },
      { title: "smart notes", w: 26, h: 96, bg: "#f7e8cd", fg: "#2b2418" },
      {
        title: "slow productivity",
        w: 38,
        h: 104,
        bg: "#2b2418",
        fg: "#faf6ee",
      },
      { title: "essays", w: 28, h: 88, bg: "#e6a23c", fg: "#2b2418", lean: -7 },
    ],
  },
];

const lift =
  "origin-bottom [transform:rotate(var(--lean,0deg))] transition-transform duration-250 hover:[transform:translateY(-10px)_rotate(0deg)]";

export default function Spaces() {
  return (
    <section
      id="shelves"
      className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-center gap-10 px-5 pt-22 pb-10"
    >
      <div className="flex flex-col gap-4">
        <Eyebrow>Living collections</Eyebrow>
        <h2 className="font-display text-[clamp(36px,4.4vw,64px)] leading-[.98] text-balance">
          Spaces fill themselves.
        </h2>
        <p className="max-w-[42ch] text-[17px] leading-normal text-pretty text-muted">
          Name a Space: Recipes, Gift ideas, Trips. Shelvr reaches back through
          everything you’ve ever saved, pulls out what belongs, and keeps adding
          as you go.
        </p>
        <div className="flex flex-wrap gap-2">
          <TagChip label="retroactive" emphasized />
          <TagChip label="automatic" emphasized />
          <TagChip label="always editable" emphasized />
        </div>
      </div>

      <div className="flex flex-col gap-[34px] py-2.5">
        {SHELVES.map((shelf) => (
          <div key={shelf.name} className="flex flex-col">
            <div
              className="flex min-h-[130px] items-end gap-2.5 px-[18px]"
              aria-hidden
            >
              {shelf.books.map((book) => (
                <div
                  key={book.title}
                  className={`${lift} relative flex items-end justify-center rounded-[6px_6px_2px_2px] px-1 py-2 shadow-[inset_-3px_0_0_rgba(0,0,0,.14),inset_2px_0_0_rgba(255,255,255,.12)]`}
                  style={{
                    width: book.w,
                    height: book.h,
                    background: book.bg,
                    color: book.fg,
                    ["--lean" as string]: `${book.lean ?? 0}deg`,
                  }}
                >
                  <span className="max-h-full rotate-180 overflow-hidden text-[11px] font-bold text-ellipsis whitespace-nowrap [writing-mode:vertical-rl]">
                    {book.title}
                  </span>
                  <span className="absolute inset-x-1.5 top-2.5 h-px bg-current opacity-35" />
                  <span className="absolute inset-x-1.5 top-3.5 h-px bg-current opacity-35" />
                </div>
              ))}
              <div
                className={`${lift} relative ml-auto w-[92px] rounded-[10px] bg-cream px-1.5 pt-1.5 pb-2 shadow-[0_10px_20px_rgba(43,36,24,.18)]`}
                style={{ ["--lean" as string]: "3deg" }}
              >
                <span className="absolute -top-2 left-1/2 h-3 w-[34px] -translate-x-1/2 -rotate-4 rounded-[2px] bg-[rgba(230,162,60,.55)]" />
                <div className="relative h-[78px] overflow-hidden rounded-[6px]">
                  <Image
                    src={shelf.src}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
              </div>
            </div>
            <div className="h-3 rounded-[3px] bg-linear-to-b from-dark-plank to-ink shadow-[0_14px_22px_-8px_rgba(43,36,24,.5),inset_0_1px_0_rgba(255,255,255,.1)]" />
            <div className="flex items-center justify-between px-1 pt-2.5">
              <div className="flex items-center gap-2">
                <SuggestedBadge />
                <span className="font-display text-xl">{shelf.name}</span>
              </div>
              <span className="text-xs font-medium text-muted">
                {shelf.count} saves
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
