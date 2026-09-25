export type Lens = "era" | "roast" | "taste" | "find";
export type RoastHeat = "gentle" | "spicy";

type LensInfo = {
  slug: Lens;
  name: string;
  hook: string;
  blurb: string;
  minImages: number;
  maxImages: number;
  waitingLine: string;
  installBridge: string;
  shareVerb: string;
};

export const LENSES: Record<Lens, LensInfo> = {
  era: {
    slug: "era",
    name: "Your Next Era",
    hook: "Upload 5 screenshots. Discover the life you're secretly planning.",
    blurb:
      "Your saved screenshots already know where you're headed. We'll name the era and show our evidence.",
    minImages: 3,
    maxImages: 6,
    waitingLine: "Reading between your screenshots…",
    installBridge:
      "Make this era happen. Keep your inspiration together in Shelvr.",
    shareVerb: "Find your era",
  },
  roast: {
    slug: "roast",
    name: "Screenshot Roast",
    hook: "Your screenshot folder has receipts. Let's hear them.",
    blurb:
      "Pick a few screenshots and we'll read them back to you, lovingly. Only the saves get roasted, never you.",
    minImages: 3,
    maxImages: 6,
    waitingLine: "Reading your receipts…",
    installBridge: "Give your screenshots somewhere better to live.",
    shareVerb: "Get roasted",
  },
  taste: {
    slug: "taste",
    name: "Name Your Taste",
    hook: "You know what you like. But what's it called?",
    blurb:
      "Show us the things you keep saving. We'll give your taste a name, a few keywords, and a palette.",
    minImages: 3,
    maxImages: 6,
    waitingLine: "Mixing your palette…",
    installBridge: "Start a space for your taste.",
    shareVerb: "Name your taste",
  },
  find: {
    slug: "find",
    name: "Find It",
    hook: "You screenshotted it. We'll help you find it.",
    blurb:
      "Add a screenshot of a place or a product. We'll make our best guess, say how sure we are, and hand you a search.",
    minImages: 1,
    maxImages: 3,
    waitingLine: "Looking for clues…",
    installBridge: "Next time, save it straight to Shelvr.",
    shareVerb: "Find yours",
  },
};

export const LENS_SLUGS = Object.keys(LENSES) as Lens[];

export function isLens(value: unknown): value is Lens {
  return typeof value === "string" && Object.hasOwn(LENSES, value);
}
