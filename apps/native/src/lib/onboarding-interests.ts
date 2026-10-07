// The answers to "What are you into?". Each picked topic becomes a starter
// space, and its sample leads the first-save picker, so the first thing a
// person saves is about something they chose and lands in a space named for it.
// The ids double as space identities and stay stable; labels are translated.
export const INTERESTS = [
  "Coffee",
  "AI",
  "Tech",
  "Startups",
  "Business",
  "Interior design",
  "Architecture",
  "Books",
] as const;
export type Interest = (typeof INTERESTS)[number];

export function isInterest(value: string): value is Interest {
  return INTERESTS.some((interest) => interest === value);
}

// Real pages, checked with readPage to return a title and readable text.
// pageHeading and domain are the page's own text and stay untranslated.
export const INTEREST_PAGES: Record<
  Interest,
  { url: string; pageHeading: string; domain: string }
> = {
  Coffee: {
    url: "https://www.jameshoffmann.co.uk/weird-coffee-science",
    pageHeading: "Weird Coffee Science",
    domain: "jameshoffmann.co.uk",
  },
  AI: {
    url: "https://www.anthropic.com/research/building-effective-agents",
    pageHeading: "Building Effective AI Agents",
    domain: "anthropic.com",
  },
  Tech: {
    url: "https://a16z.com/why-software-is-eating-the-world/",
    pageHeading: "Why Software Is Eating the World",
    domain: "a16z.com",
  },
  Startups: {
    url: "https://paulgraham.com/ds.html",
    pageHeading: "Do Things that Don't Scale",
    domain: "paulgraham.com",
  },
  Business: {
    url: "https://www.sequoiacap.com/article/writing-a-business-plan/",
    pageHeading: "Writing a Business Plan",
    domain: "sequoiacap.com",
  },
  "Interior design": {
    url: "https://www.architecturaldigest.com/story/small-living-room-ideas",
    pageHeading: "51 Small Living Room Ideas for a Cozy Common Area",
    domain: "architecturaldigest.com",
  },
  Architecture: {
    url: "https://www.archdaily.com/60022/ad-classics-fallingwater-frank-lloyd-wright",
    pageHeading: "AD Classics: Fallingwater House / Frank Lloyd Wright",
    domain: "archdaily.com",
  },
  Books: {
    url: "https://jamesclear.com/best-books",
    pageHeading: "Best Books: Over 100 Good Books to Read",
    domain: "jamesclear.com",
  },
};
