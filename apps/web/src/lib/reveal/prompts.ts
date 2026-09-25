import type { Lens, RoastHeat } from "./lenses";

type PromptOptions = { heat: RoastHeat; imageCount: number };

const SHARED_RULES = [
  "Ground every sentence in concrete details you can actually see in these screenshots: named places, products, dishes, colors, text on screen. Nothing that would fit anyone who uploaded anything, no horoscope-style filler.",
  'When you point at a specific screenshot, describe what is in it ("the ramen shop with the red noren"), not its number.',
  "Write plain text only: no markdown, no emojis, no hashtags, no quotation marks around the whole answer.",
  "If a screenshot shows private details (names, messages, addresses, faces, money, health), do not repeat them. Talk about the kind of thing saved, not the person.",
].join("\n");

function intro(imageCount: number): string {
  return `The user picked ${imageCount} screenshot${imageCount === 1 ? "" : "s"} from their camera roll.`;
}

export const PROMPTS: Record<Lens, (opts: PromptOptions) => string> = {
  era: ({ imageCount }) =>
    [
      intro(imageCount),
      "Read them together as a picture of the life this person is quietly planning. Name that life as an era.",
      'title: the era\'s name, 2 to 6 words, in the form "Your ___ Era" (for example "Your Slow Sunday Era"). Specific to these screenshots, never generic like "Your Glow Up Era".',
      "tagline: 2 or 3 short sentences, under 300 characters, describing the era warmly and specifically.",
      "evidence: 2 to 4 items, each under 160 characters, each citing one specific screenshot and the detail in it that gave the era away.",
      SHARED_RULES,
    ].join("\n\n"),

  roast: ({ imageCount, heat }) =>
    [
      intro(imageCount),
      "Roast what they chose to save, like a funny friend flipping through their camera roll.",
      heat === "spicy"
        ? "Heat: spicy. Be sharper and more pointed, with real punchlines, but stay kind. Tease the habit, never wound."
        : "Heat: gentle. Affectionate teasing, the kind that makes someone laugh at themselves.",
      "The jokes are about the saved content only: the recipes never cooked, the tenth sneaker, the trip still unbooked. Never joke about anyone's body, appearance, weight, money or income, health, identity, ethnicity, religion, gender, sexuality, age, relationships, or anything sensitive visible in a screenshot. If a screenshot is sensitive, skip it.",
      "lines: 3 to 5 roast lines, each one sentence under 160 characters, each about a specific screenshot.",
      "closer: one warm line under 160 characters that lands the roast on a kind note.",
      SHARED_RULES,
    ].join("\n\n"),

  taste: ({ imageCount }) =>
    [
      intro(imageCount),
      "Find the aesthetic that runs through them and give it a name.",
      'label: a 2 or 3 word name for this taste (for example "Sunlit Maximalist"). Evocative and specific to these screenshots.',
      "description: one sentence under 200 characters that names the concrete things these screenshots share.",
      "keywords: 4 to 6 lowercase keywords, one or two words each, drawn from what is visible (materials, colors, eras, places, moods).",
      "palette: 4 or 5 colors actually present in the screenshots, each a six-digit lowercase hex code like #e6a23c, ordered from most to least dominant.",
      SHARED_RULES,
    ].join("\n\n"),

  find: ({ imageCount }) =>
    [
      intro(imageCount),
      "They want to find the place or product each screenshot shows. Return one match per screenshot, in the order given.",
      'guess: your best identification, under 100 characters. Use only what the screenshot shows: visible names, logos, labels, signage, packaging, landmarks. Never invent a brand, shop, or address. If you cannot tell, describe what it is plainly ("a ceramic table lamp with a pleated shade") and say so with low confidence.',
      "kind: place, product, or other.",
      "confidence: high only when a name or logo is legible and unambiguous; medium when strong visual clues point one way; low otherwise. It must reflect your real uncertainty.",
      "check: one sentence under 160 characters naming where to verify the guess (a maps listing, the brand's site, a detail to compare).",
      "searchQuery: a short web search query, under 80 characters, most likely to find it.",
      SHARED_RULES,
    ].join("\n\n"),
};
