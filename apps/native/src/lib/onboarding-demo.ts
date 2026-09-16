import { SPACE_PRESETS, type SaveKind } from "@/lib/save-kinds";
import type { TextMessageKey } from "@/locales/message-types";

// Real pages, checked to fetch with a 200 and an og:title, so the demo runs the
// actual pipeline end to end. pageHeading and domain are the page's own text and
// stay untranslated.
export type DemoSample = {
  kind: SaveKind;
  url: string;
  pageHeading: string;
  domain: string;
  chipKey: TextMessageKey | null;
};

const TRAVEL_SAMPLE: DemoSample = {
  kind: "Travel",
  url: "https://www.lonelyplanet.com/articles/best-things-to-do-in-prague",
  pageHeading: "Prague: the best things to do",
  domain: "lonelyplanet.com",
  chipKey: null,
};

export const DEMO_SAMPLES: readonly DemoSample[] = [
  {
    kind: "Articles",
    url: "https://www.paulgraham.com/ds.html",
    pageHeading: "Do Things that Don't Scale",
    domain: "paulgraham.com",
    chipKey: "demo.sampleArticle",
  },
  {
    kind: "Recipes",
    url: "https://www.bbcgoodfood.com/recipes/classic-lasagne",
    pageHeading: "Easy classic lasagne",
    domain: "bbcgoodfood.com",
    chipKey: "demo.sampleRecipe",
  },
  {
    kind: "Products",
    url: "https://www.apple.com/airpods-pro/",
    pageHeading: "AirPods Pro 3",
    domain: "apple.com",
    chipKey: "demo.sampleProduct",
  },
  TRAVEL_SAMPLE,
];

/** The share demo's post: the first picked kind with a sample, else Travel. */
export function pickDemoSample(kinds: readonly SaveKind[]): DemoSample {
  for (const kind of kinds) {
    const sample = DEMO_SAMPLES.find((candidate) => candidate.kind === kind);
    if (sample) return sample;
  }
  return TRAVEL_SAMPLE;
}

/** A sample files into its kind's first preset space when the user kept that
 * space. Any other link is left to the classifier. */
export function demoDestination(
  url: string,
  spaces: readonly string[],
): string | null {
  const sample = DEMO_SAMPLES.find((candidate) => candidate.url === url);
  if (!sample) return null;
  const preset = SPACE_PRESETS[sample.kind][0];
  return spaces.includes(preset) ? preset : null;
}
