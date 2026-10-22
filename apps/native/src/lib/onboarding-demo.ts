import {
  INTEREST_PAGES,
  INTERESTS,
  type Interest,
} from "@/lib/onboarding-interests";
import { SPACE_PRESETS, type SaveKind } from "@/lib/save-kinds";

export type DemoKind = Extract<
  SaveKind,
  "Articles" | "Recipes" | "Products" | "Travel" | "Videos"
>;

export type DemoSample = {
  kind: DemoKind;
  interest?: Interest;
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
    url: "https://www.prague.eu/en/objevujte/old-town-square-staromestske-namesti/",
    pageHeading: "Old Town Square",
    domain: "prague.eu",
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

const INTEREST_SAMPLES: readonly DemoSample[] = INTERESTS.map((interest) => ({
  kind: "Articles",
  interest,
  ...INTEREST_PAGES[interest],
}));

const SAMPLE_COUNT = 3;

export function orderDemoSamples(
  kinds: readonly SaveKind[],
  interests: readonly Interest[] = [],
): DemoSample[] {
  const rank = (sample: DemoSample) => {
    const index = kinds.indexOf(sample.kind);
    return index === -1 ? kinds.length : index;
  };
  const byKind = [...DEMO_SAMPLES].sort((a, b) => rank(a) - rank(b));
  const lead = byKind.filter((sample) => kinds.includes(sample.kind));
  const topical = interests.flatMap((interest) =>
    INTEREST_SAMPLES.filter((sample) => sample.interest === interest),
  );
  const ordered = [
    ...lead.slice(0, 1),
    ...topical,
    ...lead.slice(1),
    ...byKind.filter((sample) => !kinds.includes(sample.kind)),
  ];
  return ordered
    .filter(
      (sample, index) =>
        ordered.findIndex((other) => other.url === sample.url) === index,
    )
    .slice(0, SAMPLE_COUNT);
}

export function featuredDemoKind(
  kinds: readonly SaveKind[],
  interests: readonly Interest[] = [],
): DemoKind | null {
  const featured = orderDemoSamples(kinds, interests)[0];
  if (featured === undefined) return null;
  return featured.interest !== undefined || kinds.includes(featured.kind)
    ? featured.kind
    : null;
}

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

export function isDemoSample(url: string): boolean {
  return findSample(url) !== undefined;
}

export function findSample(url: string): DemoSample | undefined {
  return [...DEMO_SAMPLES, ...INTEREST_SAMPLES].find(
    (sample) => sample.url === url,
  );
}

export function demoDestination(
  url: string,
  spaces: readonly string[],
): string | null {
  const sample = findSample(url);
  if (!sample) return null;
  if (sample.interest !== undefined && spaces.includes(sample.interest)) {
    return sample.interest;
  }
  const preset = SPACE_PRESETS[sample.kind][0];
  return spaces.includes(preset) ? preset : null;
}
