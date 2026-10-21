// The answers to "What are you into?". Each picked topic becomes a starter
// space, and its sample leads the first-save picker, so the first thing a
// person saves is about something they chose and lands in a space named for it.
// The ids double as space identities and stay stable; labels are translated.
// A few broad topics, one per thing people save, so the list fits one screen.
// Travel comes first so it sits in the first row of chips.
export const INTERESTS = [
  "Travel",
  "Food & recipes",
  "Home & design",
  "Style & shopping",
  "Fitness & wellness",
  "AI & tech",
  "Business & productivity",
  "Films, books & music",
] as const;
export type Interest = (typeof INTERESTS)[number];

export function isInterest(value: string): value is Interest {
  return INTERESTS.some((interest) => interest === value);
}

// Real pages, checked with readPage to return a title and readable text.
// pageHeading and domain are the page's own text and stay untranslated.
// A topic whose subject has a setup kind with a sample (Travel, Recipes,
// Products) names that kind and uses its sample, so the page is defined once.
type InterestPage =
  | { url: string; pageHeading: string; domain: string }
  | { sampleOf: "Travel" | "Recipes" | "Products" };

export const INTEREST_PAGES: Record<Interest, InterestPage> = {
  Travel: { sampleOf: "Travel" },
  "Food & recipes": { sampleOf: "Recipes" },
  "Home & design": {
    url: "https://www.architecturaldigest.com/story/small-living-room-ideas",
    pageHeading: "51 Small Living Room Ideas for a Cozy Common Area",
    domain: "architecturaldigest.com",
  },
  "Style & shopping": { sampleOf: "Products" },
  "Fitness & wellness": {
    url: "https://www.healthline.com/health/fitness/7-minute-workout",
    pageHeading: "How Effective is the 7-Minute Workout? We Asked a Trainer",
    domain: "healthline.com",
  },
  "AI & tech": {
    url: "https://www.anthropic.com/research/building-effective-agents",
    pageHeading: "Building Effective AI Agents",
    domain: "anthropic.com",
  },
  "Business & productivity": {
    url: "https://paulgraham.com/ds.html",
    pageHeading: "Do Things that Don't Scale",
    domain: "paulgraham.com",
  },
  "Films, books & music": {
    url: "https://jamesclear.com/best-books",
    pageHeading: "Best Books: Over 100 Good Books to Read",
    domain: "jamesclear.com",
  },
};
