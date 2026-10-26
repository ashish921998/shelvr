import {
  INTEREST_PAGES,
  INTERESTS,
  type Interest,
} from "@/lib/onboarding-interests";
import type { SampleCityId } from "@/lib/sample-cities";
import type { SaveKind } from "@/lib/save-kinds";

type DemoKind = Extract<
  SaveKind,
  "Articles" | "Recipes" | "Products" | "Travel" | "Videos"
>;

type DemoSample = {
  kind: DemoKind;
  interest?: Interest;
  city?: SampleCityId;
  picture?: "food" | "view";
  url: string;
  pageHeading: string;
  domain: string;
};

const DEMO_SAMPLES: readonly DemoSample[] = [
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
  amsterdam: {
    url: "https://maps.apple.com/?q=Rijksmuseum&ll=52.36%2C4.8852",
    pageHeading: "Rijksmuseum",
    domain: "maps.apple.com",
  },
  austin: {
    url: "https://maps.apple.com/?q=Blanton%20Museum%20of%20Art&ll=30.2808%2C-97.7377",
    pageHeading: "Blanton Museum of Art",
    domain: "maps.apple.com",
  },
  berlin: {
    url: "https://maps.apple.com/?q=German%20Spy%20Museum&ll=52.5089%2C13.3793",
    pageHeading: "German Spy Museum",
    domain: "maps.apple.com",
  },
  chicago: {
    url: "https://maps.apple.com/?q=Chicago%20Architecture%20Center&ll=41.888%2C-87.6235",
    pageHeading: "Chicago Architecture Center",
    domain: "maps.apple.com",
  },
  copenhagen: {
    url: "https://maps.apple.com/?q=Nikolaj%20Art%20Gallery&ll=55.6786%2C12.5816",
    pageHeading: "Nikolaj Art Gallery",
    domain: "maps.apple.com",
  },
  dallas: {
    url: "https://maps.apple.com/?q=The%20Sixth%20Floor%20Museum%20at%20Dealey%20Plaza&ll=32.7798%2C-96.8085",
    pageHeading: "The Sixth Floor Museum at Dealey Plaza",
    domain: "maps.apple.com",
  },
  florence: {
    url: "https://maps.apple.com/?q=Basilica%20of%20Santa%20Maria%20Novella&ll=43.7746%2C11.2494",
    pageHeading: "Basilica of Santa Maria Novella",
    domain: "maps.apple.com",
  },
  "las-vegas": {
    url: "https://maps.apple.com/?q=Meow%20Wolf%20Las%20Vegas%27%20Omega%20Mart&ll=36.1325%2C-115.1819",
    pageHeading: "Meow Wolf Las Vegas' Omega Mart",
    domain: "maps.apple.com",
  },
  madrid: {
    url: "https://maps.apple.com/?q=Museo%20Nacional%20Centro%20de%20Arte%20Reina%20Sof%C3%ADa&ll=40.4079%2C-3.6946",
    pageHeading: "Museo Nacional Centro de Arte Reina Sofía",
    domain: "maps.apple.com",
  },
  milan: {
    url: "https://maps.apple.com/?q=Basilica%20of%20Sant%27Ambrogio&ll=45.4623%2C9.1755",
    pageHeading: "Basilica of Sant'Ambrogio",
    domain: "maps.apple.com",
  },
  montreal: {
    url: "https://maps.apple.com/?q=Saint%20Joseph%27s%20Oratory%20of%20Mount%20Royal&ll=45.4921%2C-73.6191",
    pageHeading: "Saint Joseph's Oratory of Mount Royal",
    domain: "maps.apple.com",
  },
  rome: {
    url: "https://maps.apple.com/?q=Capitoline%20Museums&ll=41.8929%2C12.4826",
    pageHeading: "Capitoline Museums",
    domain: "maps.apple.com",
  },
  seattle: {
    url: "https://maps.apple.com/?q=Cal%20Anderson%20Park&ll=47.617%2C-122.3191",
    pageHeading: "Cal Anderson Park",
    domain: "maps.apple.com",
  },
  vancouver: {
    url: "https://maps.apple.com/?q=Museum%20of%20Vancouver&ll=49.2763%2C-123.1444",
    pageHeading: "Museum of Vancouver",
    domain: "maps.apple.com",
  },
};

const CITY_SAMPLES: readonly DemoSample[] = Object.entries(CITY_PAGES).map(
  ([city, page]) => ({
    kind: "Travel",
    city: city as SampleCityId,
    ...page,
  }),
);

const INTEREST_SAMPLES: readonly DemoSample[] = INTERESTS.flatMap(
  (interest) => {
    const page = INTEREST_PAGES[interest];
    if (!("sampleOf" in page)) return [{ kind: "Articles", interest, ...page }];
    const shared = DEMO_SAMPLES.find((sample) => sample.kind === page.sampleOf);
    return shared === undefined ? [] : [{ ...shared, interest }];
  },
);

export function findSample(url: string): DemoSample | undefined {
  return [...DEMO_SAMPLES, ...INTEREST_SAMPLES, ...CITY_SAMPLES].find(
    (sample) => sample.url === url,
  );
}
