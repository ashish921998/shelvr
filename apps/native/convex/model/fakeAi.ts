import type { wrapLanguageModel } from "ai";

type AnyLanguageModel = Parameters<typeof wrapLanguageModel>[0]["model"];
type FakeLanguageModel = Extract<
  AnyLanguageModel,
  { specificationVersion: "v4" }
>;
type CallOptions = Parameters<FakeLanguageModel["doGenerate"]>[0];

export const FAKE_AI_SWITCH = "local-v1";

export const FAKE_AI_PLACEHOLDER_KEY = "ci-no-model";

type FakeAiVars = {
  E2E_FAKE_AI?: string;
  AUTH_ENABLE_ANONYMOUS?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  CONVEX_CLOUD_URL?: string;
};

export type FakeAiRefusal =
  | "switch_off"
  | "not_local"
  | "dev_sign_in_off"
  | "real_key";

export function fakeAiLocks(
  vars: FakeAiVars,
): { enabled: true } | { enabled: false; refusedBy: FakeAiRefusal } {
  if (vars.E2E_FAKE_AI !== FAKE_AI_SWITCH) {
    return { enabled: false, refusedBy: "switch_off" };
  }
  if (!isLoopback(vars.CONVEX_CLOUD_URL)) {
    return { enabled: false, refusedBy: "not_local" };
  }
  if (vars.AUTH_ENABLE_ANONYMOUS !== "true") {
    return { enabled: false, refusedBy: "dev_sign_in_off" };
  }
  if (vars.GOOGLE_GENERATIVE_AI_API_KEY !== FAKE_AI_PLACEHOLDER_KEY) {
    return { enabled: false, refusedBy: "real_key" };
  }
  return { enabled: true };
}

function isLoopback(url: string | undefined): boolean {
  if (url === undefined) return false;
  try {
    return new URL(url).hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const ANALYSIS_KEYS = "cities,description,intents,spaceNames,tags,title";
const NOTE_TASK = "Analyze this saved note";
const NOTE_MARKER = "\n\nNote:\n";
const LINK_TASK = "Analyze this saved web page";
const CONTENT_MARKER = "\n\nPage content:\n";
const INTENTS_MARKER = "\n\nAlso propose up to ";
const RECOMMEND_KEYS = "itemNumbers";
const RECOMMEND_TASK = "The user just created a space";
const SPACE_NAME = /^Space name: "(.*)"$/m;
const SAVES_MARKER = "Below is a numbered list of the user's saved items.";
const TITLE_WORDS = 6;
const MAX_TAGS = 6;

type Analysis = {
  title: string;
  description: string;
  tags: string[];
  spaceNames: string[];
  intents: never[];
  cities: never[];
};

type PromptPage = { title?: string; description?: string; content?: string };

function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? []);
}

function tagsFrom(text: string): string[] {
  return [...wordsOf(text)].slice(0, MAX_TAGS);
}

export function fakeNoteAnalysis(note: string): Analysis {
  const firstLine = note.trim().split("\n")[0]?.trim() ?? "";
  const words = firstLine.split(/\s+/).filter((word) => word.length > 0);
  const title = words
    .slice(0, TITLE_WORDS)
    .join(" ")
    .replace(/[.,;:!?]+$/, "");
  return {
    title,
    description: firstLine,
    tags: tagsFrom(note),
    spaceNames: [],
    intents: [],
    cities: [],
  };
}

export function fakeLinkAnalysis(page: PromptPage): Analysis | undefined {
  if (page.title === undefined) return undefined;
  const firstLine = page.content?.trim().split("\n")[0]?.trim();
  return {
    title: page.title,
    description: page.description ?? firstLine ?? page.title,
    tags: tagsFrom(`${page.title}\n${page.content ?? ""}`),
    spaceNames: [],
    intents: [],
    cities: [],
  };
}

export function noteFromPrompt(prompt: string): string | undefined {
  if (!prompt.includes(NOTE_TASK)) return undefined;
  const start = prompt.indexOf(NOTE_MARKER);
  const end = prompt.lastIndexOf(INTENTS_MARKER);
  if (start === -1 || end < start) return undefined;
  return prompt.slice(start + NOTE_MARKER.length, end);
}

export function pageFromPrompt(prompt: string): PromptPage | undefined {
  const end = prompt.lastIndexOf(INTENTS_MARKER);
  if (!prompt.includes(LINK_TASK) || end === -1) return undefined;
  const head = prompt.slice(0, end);
  const start = head.indexOf(CONTENT_MARKER);
  const sections = (start === -1 ? head : head.slice(0, start)).split("\n\n");
  const labelled = (label: string) =>
    sections.find((section) => section.startsWith(label))?.slice(label.length);
  return {
    title: labelled("Page title: "),
    description: labelled("Meta description: "),
    content:
      start === -1 ? undefined : head.slice(start + CONTENT_MARKER.length),
  };
}

function savesFromPrompt(prompt: string): string[] {
  const marker = prompt.indexOf(SAVES_MARKER);
  if (marker === -1) return [];
  const start = prompt.indexOf("\n\n", marker);
  if (start === -1) return [];
  const saves: string[] = [];
  for (const line of prompt.slice(start + 2).split("\n")) {
    const next = `${saves.length + 1}. `;
    if (line.startsWith(next)) saves.push(line.slice(next.length));
    else if (saves.length > 0) saves[saves.length - 1] += `\n${line}`;
  }
  return saves;
}

export function fakeRecommendation(
  prompt: string,
): { itemNumbers: number[] } | undefined {
  const name = prompt.includes(RECOMMEND_TASK)
    ? SPACE_NAME.exec(prompt)?.[1]
    : undefined;
  if (name === undefined) return undefined;
  const nameWords = wordsOf(name);
  const itemNumbers = savesFromPrompt(prompt)
    .map((save, i) => ({ save, number: i + 1 }))
    .filter(({ save }) => [...wordsOf(save)].some((w) => nameWords.has(w)))
    .map(({ number }) => number);
  return { itemNumbers };
}

function promptText(options: CallOptions): string {
  return options.prompt
    .filter((message) => message.role === "user")
    .flatMap((message) =>
      message.content.flatMap((part) =>
        part.type === "text" ? [part.text] : [],
      ),
    )
    .join("\n\n");
}

function schemaKeys(options: CallOptions): string | undefined {
  const format = options.responseFormat;
  if (format?.type !== "json" || typeof format.schema !== "object") {
    return undefined;
  }
  const properties = format.schema.properties;
  return properties === undefined
    ? undefined
    : Object.keys(properties).sort().join(",");
}

export class FakeAiUnansweredError extends Error {
  constructor() {
    super("The e2e fake model has no answer for this call");
    this.name = "FakeAiUnansweredError";
  }
}

export function fakeAnswer(
  options: CallOptions,
): Analysis | { itemNumbers: number[] } {
  const keys = schemaKeys(options);
  const prompt = promptText(options);
  if (keys === RECOMMEND_KEYS) {
    const picks = fakeRecommendation(prompt);
    if (picks === undefined) throw new FakeAiUnansweredError();
    return picks;
  }
  if (keys !== ANALYSIS_KEYS) throw new FakeAiUnansweredError();
  const note = noteFromPrompt(prompt);
  if (note !== undefined) return fakeNoteAnalysis(note);
  const page = pageFromPrompt(prompt);
  const answer = page && fakeLinkAnalysis(page);
  if (answer === undefined) throw new FakeAiUnansweredError();
  return answer;
}

export const FAKE_MODEL: FakeLanguageModel = {
  specificationVersion: "v4",
  provider: "e2e-fake",
  modelId: "e2e-fake-v1",
  supportedUrls: {},
  doGenerate: async (options) => ({
    content: [{ type: "text", text: JSON.stringify(fakeAnswer(options)) }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: {
        total: 0,
        noCache: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    warnings: [],
  }),
  doStream: async () => {
    throw new FakeAiUnansweredError();
  },
};

/** `.invalid` never resolves (RFC 2606). */
export const FIXTURE_ORIGIN = "https://fixtures.e2e.invalid";

type FixturePage = {
  title: string;
  siteName: string;
  description: string;
  content: string;
};

const FIXTURE_PAGES = new Map<string, FixturePage>([
  [
    "/quince-paste",
    {
      title: "Quince paste for beginners",
      siteName: "Shelvr fixtures",
      description: "How to cook membrillo slowly until it sets.",
      content:
        "Quince paste, or membrillo, sets once the fruit has cooked down for an hour.\n\nServe it with sharp cheese.",
    },
  ],
]);

export function fixturePage(url: string): FixturePage | undefined {
  try {
    const parsed = new URL(url);
    return parsed.origin === FIXTURE_ORIGIN
      ? FIXTURE_PAGES.get(parsed.pathname)
      : undefined;
  } catch {
    return undefined;
  }
}
