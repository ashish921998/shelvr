// The answers to "What are you into?". Each picked topic becomes a starter
// space, and its sample leads the first-save picker, so the first thing a
// person saves is about something they chose and lands in a space named for it.
// The ids double as space identities and stay stable; labels are translated.
export const INTERESTS = [
  "AI",
  "Tech",
  "Startups",
  "Business",
  "Money",
  "Productivity",
  "Design",
  "Interior design",
  "Architecture",
  "Photography",
  "Films",
  "Anime",
  "Music",
  "Gaming",
  "Books",
  "Science",
  "Coffee",
  "Travel",
  "Fitness",
  "Wellness",
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
  Money: {
    url: "https://www.nerdwallet.com/article/finance/how-to-budget",
    pageHeading: "How to Make a Budget: A Step-By-Step Guide",
    domain: "nerdwallet.com",
  },
  Productivity: {
    url: "https://todoist.com/productivity-methods/pomodoro-technique",
    pageHeading: "The Pomodoro Technique — Why it works & how to do it",
    domain: "todoist.com",
  },
  Design: {
    url: "https://www.nngroup.com/articles/ten-usability-heuristics/",
    pageHeading: "10 Usability Heuristics for User Interface Design",
    domain: "nngroup.com",
  },
  Photography: {
    url: "https://www.nationalgeographic.com/photography",
    pageHeading: "Photography",
    domain: "nationalgeographic.com",
  },
  Films: {
    url: "https://www.bfi.org.uk/sight-and-sound/greatest-films-all-time",
    pageHeading: "The Greatest Films of All Time",
    domain: "bfi.org.uk",
  },
  Anime: {
    url: "https://myanimelist.net/topanime.php",
    pageHeading: "Top Anime",
    domain: "myanimelist.net",
  },
  Music: {
    url: "https://www.rollingstone.com/music/music-lists/best-albums-of-all-time-1062063/",
    pageHeading: "The 500 Greatest Albums of All Time",
    domain: "rollingstone.com",
  },
  Gaming: {
    url: "https://www.ign.com/articles/the-best-100-video-games-of-all-time",
    pageHeading: "The Top 100 Video Games of All Time",
    domain: "ign.com",
  },
  Science: {
    url: "https://en.wikipedia.org/wiki/James_Webb_Space_Telescope",
    pageHeading: "James Webb Space Telescope",
    domain: "en.wikipedia.org",
  },
  // Travel and Fitness share their identity with the setup kinds' first
  // preset space, so picking the kind picks the topic and the other way round.
  // Travel offers the same page as the Travel kind's sample.
  Travel: {
    url: "https://www.lonelyplanet.com/articles/best-things-to-do-in-prague",
    pageHeading: "Prague: the best things to do",
    domain: "lonelyplanet.com",
  },
  Fitness: {
    url: "https://www.healthline.com/health/fitness/7-minute-workout",
    pageHeading: "How Effective is the 7-Minute Workout? We Asked a Trainer",
    domain: "healthline.com",
  },
  Wellness: {
    url: "https://www.sleepfoundation.org/sleep-hygiene",
    pageHeading: "Mastering Sleep Hygiene: Your Path to Quality Sleep",
    domain: "sleepfoundation.org",
  },
  Books: {
    url: "https://jamesclear.com/best-books",
    pageHeading: "Best Books: Over 100 Good Books to Read",
    domain: "jamesclear.com",
  },
};
