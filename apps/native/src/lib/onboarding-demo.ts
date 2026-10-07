import { SPACE_PRESETS, type SaveKind } from "@/lib/save-kinds";

// Real pages, checked to fetch with a 200 and an og:title, so the demo runs the
// actual pipeline end to end. pageHeading and domain are the page's own text and
// stay untranslated.
export type DemoKind = Extract<
  SaveKind,
  "Articles" | "Recipes" | "Products" | "Travel" | "Videos"
>;

export type DemoSample = {
  kind: DemoKind;
  url: string;
  pageHeading: string;
  domain: string;
};

export const DEMO_SAMPLES: readonly DemoSample[] = [
  {
    kind: "Recipes",
    url: "https://www.bbcgoodfood.com/recipes/classic-lasagne",
    pageHeading: "Easy classic lasagne",
    domain: "bbcgoodfood.com",
  },
  {
    kind: "Products",
    url: "https://www.apple.com/airpods-pro/",
    pageHeading: "AirPods Pro 3",
    domain: "apple.com",
  },
  {
    kind: "Travel",
    url: "https://www.lonelyplanet.com/articles/best-things-to-do-in-prague",
    pageHeading: "Prague: the best things to do",
    domain: "lonelyplanet.com",
  },
  {
    kind: "Videos",
    url: "https://www.ted.com/talks/tim_urban_inside_the_mind_of_a_master_procrastinator",
    pageHeading: "Inside the mind of a master procrastinator",
    domain: "ted.com",
  },
  {
    kind: "Articles",
    url: "https://fs.blog/reading/",
    pageHeading: "Use These Simple Strategies to Retain Everything You Read",
    domain: "fs.blog",
  },
];

const SAMPLE_COUNT = 3;

/** The demo's ready-made links: the picked kinds' samples first. */
export function orderDemoSamples(kinds: readonly SaveKind[]): DemoSample[] {
  const rank = (sample: DemoSample) => {
    const index = kinds.indexOf(sample.kind);
    return index === -1 ? kinds.length : index;
  };
  return [...DEMO_SAMPLES]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, SAMPLE_COUNT);
}

/** The kind the picker's headline names: the leading sample's, when setup
 * picked it. Null when nothing picked has a sample, and the headline says
 * "link". */
export function featuredDemoKind(kinds: readonly SaveKind[]): DemoKind | null {
  const featured = orderDemoSamples(kinds)[0];
  return featured !== undefined && kinds.includes(featured.kind)
    ? featured.kind
    : null;
}

/** The share-sheet practice after the first save: the reading article
 * (it previews reliably), else the picked kinds' first sample, never the link
 * the demo already saved. */
export function practiceShareSample(
  kinds: readonly SaveKind[],
  savedUrl: string | null,
): DemoSample | undefined {
  const featured = DEMO_SAMPLES.find((sample) => sample.kind === "Articles");
  return [
    ...(featured === undefined ? [] : [featured]),
    ...orderDemoSamples(kinds),
  ].find((sample) => sample.url !== savedUrl);
}

/** A ready-made sample, which the demo can preview before sign-in. */
export function isDemoSample(url: string): boolean {
  return DEMO_SAMPLES.some((sample) => sample.url === url);
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
