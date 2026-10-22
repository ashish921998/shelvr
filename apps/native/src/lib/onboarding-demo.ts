import {
  INTEREST_PAGES,
  INTERESTS,
  type Interest,
} from "@/lib/onboarding-interests";
import type { SampleCityId } from "@/lib/sample-cities";
import type { SaveKind } from "@/lib/save-kinds";

export type DemoKind = Extract<
  SaveKind,
  "Articles" | "Recipes" | "Products" | "Travel" | "Videos"
>;

export type DemoSample = {
  kind: DemoKind;
  interest?: Interest;
  city?: SampleCityId;
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

// Wikipedia where the tourism sites sit behind bot checks the backend reader cannot pass.
const CITY_PAGES: Record<
  Exclude<SampleCityId, "prague">,
  Pick<DemoSample, "url" | "pageHeading" | "domain">
> = {
  barcelona: {
    url: "https://en.wikipedia.org/wiki/Sagrada_Fam%C3%ADlia",
    pageHeading: "Sagrada Família",
    domain: "en.wikipedia.org",
  },
  lisbon: {
    url: "https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower",
    pageHeading: "Belém Tower",
    domain: "en.wikipedia.org",
  },
  london: {
    url: "https://en.wikipedia.org/wiki/Covent_Garden",
    pageHeading: "Covent Garden",
    domain: "en.wikipedia.org",
  },
  "los-angeles": {
    url: "https://en.wikipedia.org/wiki/Venice_Canal_Historic_District",
    pageHeading: "Venice Canal Historic District",
    domain: "en.wikipedia.org",
  },
  "new-york": {
    url: "https://en.wikipedia.org/wiki/Brooklyn_Bridge",
    pageHeading: "Brooklyn Bridge",
    domain: "en.wikipedia.org",
  },
  paris: {
    url: "https://en.wikipedia.org/wiki/Jardin_du_Luxembourg",
    pageHeading: "Jardin du Luxembourg",
    domain: "en.wikipedia.org",
  },
  "san-francisco": {
    url: "https://en.wikipedia.org/wiki/Mission_Dolores_Park",
    pageHeading: "Mission Dolores Park",
    domain: "en.wikipedia.org",
  },
  seoul: {
    url: "https://en.wikipedia.org/wiki/Bukchon_Hanok_Village",
    pageHeading: "Bukchon Hanok Village",
    domain: "en.wikipedia.org",
  },
  tokyo: {
    url: "https://en.wikipedia.org/wiki/Sens%C5%8D-ji",
    pageHeading: "Sensō-ji",
    domain: "en.wikipedia.org",
  },
  toronto: {
    url: "https://www.cntower.ca/",
    pageHeading: "CN Tower",
    domain: "cntower.ca",
  },
};

const CITY_SAMPLES: readonly DemoSample[] = Object.entries(CITY_PAGES).map(
  ([city, page]) => ({
    kind: "Travel",
    city: city as SampleCityId,
    ...page,
  }),
);

function inCity(sample: DemoSample, city: SampleCityId | null): DemoSample {
  if (sample.kind !== "Travel" || city === null || city === "prague") {
    return sample;
  }
  const local = CITY_SAMPLES.find((other) => other.city === city);
  return local === undefined ? sample : { ...local, interest: sample.interest };
}

const INTEREST_SAMPLES: readonly DemoSample[] = INTERESTS.flatMap(
  (interest) => {
    const page = INTEREST_PAGES[interest];
    if (!("sampleOf" in page)) return [{ kind: "Articles", interest, ...page }];
    const shared = DEMO_SAMPLES.find((sample) => sample.kind === page.sampleOf);
    return shared === undefined ? [] : [{ ...shared, interest }];
  },
);

/** The post share practice offers: the first picked topic's page, in the picked city, or the article sample. */
export function practiceShareSample(
  interests: readonly Interest[],
  city: SampleCityId | null = null,
): DemoSample | undefined {
  const sample =
    INTEREST_SAMPLES.find((other) => other.interest === interests[0]) ??
    DEMO_SAMPLES.find((other) => other.kind === "Articles");
  return sample === undefined ? undefined : inCity(sample, city);
}

export function findSample(url: string): DemoSample | undefined {
  return [...DEMO_SAMPLES, ...INTEREST_SAMPLES, ...CITY_SAMPLES].find(
    (sample) => sample.url === url,
  );
}
