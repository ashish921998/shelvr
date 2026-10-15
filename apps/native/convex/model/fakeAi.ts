import type { wrapLanguageModel } from "ai";

/**
 * A stand-in for Gemini that only an e2e backend on the CI runner may use.
 *
 * The e2e job runs the app against a throwaway local Convex backend with a
 * placeholder model key, so every real model call fails and a save that needs
 * one can never finish. This model answers instead, from the saved content
 * itself, so a flow like save-note can run on every pull request with no
 * secret. It knows two calls (a note's and a fixture page's classification)
 * and fails loudly on anything else, so a flow that strays onto an unanswered
 * call fails instead of passing on an invented answer. It recognizes them by
 * the wording of the prompts in ai.ts; aiFakeModel.test.ts runs those real
 * prompts through it, so a rewording that would strand the fake fails there.
 */

type AnyLanguageModel = Parameters<typeof wrapLanguageModel>[0]["model"];
type FakeLanguageModel = Extract<
  AnyLanguageModel,
  { specificationVersion: "v4" }
>;
type CallOptions = Parameters<FakeLanguageModel["doGenerate"]>[0];

/** The only value of E2E_FAKE_AI that turns the fake on. Versioned, so a
 * stray "true" or "1" set by hand does nothing. */
export const FAKE_AI_SWITCH = "local-v1";

/** The placeholder model key the e2e workflow sets. Any other key, above all
 * a real one, keeps the real model. */
export const FAKE_AI_PLACEHOLDER_KEY = "ci-no-model";

type FakeAiVars = {
  E2E_FAKE_AI?: string;
  AUTH_ENABLE_ANONYMOUS?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  CONVEX_CLOUD_URL?: string;
};

/** Why the fake stays off. `switch_off` is every real deployment's normal
 * state; the rest mean someone set the switch where it does not belong. */
export type FakeAiRefusal =
  | "switch_off"
  | "not_local"
  | "dev_sign_in_off"
  | "real_key";

/**
 * Every lock must hold at once: the switch, a backend on this machine's
 * loopback address, dev sign-in (which no cloud deployment but dev enables),
 * and the e2e placeholder key. Exported pure for unit testing.
 */
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

/** The keys of itemAnalysisSchema in ai.ts, sorted: the plain note and
 * web page classification. The recipe and video variants add keys, so the
 * fake does not answer them. */
const ANALYSIS_KEYS = "description,intents,spaceNames,tags,title";
// Markers from the note and link prompts in ai.ts: their task lines, the
// sections that carry the note or the page, and the intents block that
// always closes both.
const NOTE_TASK = "Analyze this saved note";
const NOTE_MARKER = "\n\nNote:\n";
const LINK_TASK = "Analyze this saved web page";
const CONTENT_MARKER = "\n\nPage content:\n";
const INTENTS_MARKER = "\n\nAlso propose up to ";
const TITLE_WORDS = 6;
const MAX_TAGS = 6;

type Analysis = {
  title: string;
  description: string;
  tags: string[];
  spaceNames: string[];
  intents: never[];
};

/** A web page as the fake reads it back out of the link prompt. */
type PromptPage = { title?: string; description?: string; content?: string };

/** Unique lowercase words of four letters or more, as tags. */
function tagsFrom(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? [])].slice(
    0,
    MAX_TAGS,
  );
}

/**
 * What the fake says about a note: its first words as the title, its first
 * line as the description, and its longer words as tags. No space
 * suggestions and no actions, so a flow never depends on the fake's taste.
 * Exported pure for unit testing.
 */
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
  };
}

/**
 * What the fake says about a web page: the page's own title, its meta
 * description (or the first line of its text), and its words as tags.
 * Undefined for a page with no title, which the fake leaves unanswered.
 * Exported pure for unit testing.
 */
export function fakeLinkAnalysis(page: PromptPage): Analysis | undefined {
  if (page.title === undefined) return undefined;
  const firstLine = page.content?.trim().split("\n")[0]?.trim();
  return {
    title: page.title,
    description: page.description ?? firstLine ?? page.title,
    tags: tagsFrom(`${page.title}\n${page.content ?? ""}`),
    spaceNames: [],
    intents: [],
  };
}

/** The note text a note classification prompt carries, or undefined when
 * the prompt is not one. The note sits between its "Note:" section and the
 * intents block, and may itself hold blank lines. Exported pure for unit
 * testing. */
export function noteFromPrompt(prompt: string): string | undefined {
  if (!prompt.includes(NOTE_TASK)) return undefined;
  const start = prompt.indexOf(NOTE_MARKER);
  const end = prompt.lastIndexOf(INTENTS_MARKER);
  if (start === -1 || end < start) return undefined;
  return prompt.slice(start + NOTE_MARKER.length, end);
}

/** The page a link classification prompt carries, or undefined when the
 * prompt is not one. Its labelled lines come before the page text, which
 * runs to the intents block and may itself hold blank lines. Exported pure
 * for unit testing. */
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

/** Thrown for any call the fake has no answer for. Its message names no
 * content, so it is safe in the log stream. */
export class FakeAiUnansweredError extends Error {
  constructor() {
    super("The e2e fake model has no answer for this call");
    this.name = "FakeAiUnansweredError";
  }
}

/** The answer to one call, or a thrown FakeAiUnansweredError. Exported for
 * unit testing. */
export function fakeAnswer(options: CallOptions): Analysis {
  if (schemaKeys(options) !== ANALYSIS_KEYS) throw new FakeAiUnansweredError();
  const prompt = promptText(options);
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

/** The made-up origin of the e2e fixture pages. `.invalid` never resolves
 * (RFC 2606), so a real fetch of it fails and the fake never stands in for a
 * page anyone could publish. */
export const FIXTURE_ORIGIN = "https://fixtures.e2e.invalid";

type FixturePage = {
  title: string;
  siteName: string;
  description: string;
  content: string;
};

/** The pages a flow can save while the fake is on, by path. The words are
 * in no seeded save, so a search for them finds only the new one. */
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

/** The fixture page at `url`, or undefined for any other address. The caller
 * asks only while the fake is on, so with it off a fixture URL is read like
 * any other link and fails to resolve. */
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
