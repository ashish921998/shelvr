import type { wrapLanguageModel } from "ai";

/**
 * A stand-in for Gemini that only an e2e backend on the CI runner may use.
 *
 * The e2e job runs the app against a throwaway local Convex backend with a
 * placeholder model key, so every real model call fails and a save that needs
 * one can never finish. This model answers instead, from the saved content
 * itself, so a flow like save-note can run on every pull request with no
 * secret. It knows one call (a note's classification) and fails loudly on
 * anything else, so a flow that strays onto an unanswered call fails instead
 * of passing on an invented answer.
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

/** The keys of the note classification schema in ai.ts, sorted. */
const NOTE_ANALYSIS_KEYS = "description,intents,spaceNames,tags,title";
// Markers from analyzeNoteItem's prompt in ai.ts: its task line, the section
// that carries the note, and the intents block that always follows it.
const NOTE_TASK = "Analyze this saved note";
const NOTE_MARKER = "\n\nNote:\n";
const INTENTS_MARKER = "\n\nAlso propose up to ";
const TITLE_WORDS = 6;
const MAX_TAGS = 6;

type NoteAnalysis = {
  title: string;
  description: string;
  tags: string[];
  spaceNames: string[];
  intents: never[];
};

/**
 * What the fake says about a note: its first words as the title, its first
 * line as the description, and its longer words as tags. No space
 * suggestions and no actions, so a flow never depends on the fake's taste.
 * Exported pure for unit testing.
 */
export function fakeNoteAnalysis(note: string): NoteAnalysis {
  const firstLine = note.trim().split("\n")[0]?.trim() ?? "";
  const words = firstLine.split(/\s+/).filter((word) => word.length > 0);
  const title = words
    .slice(0, TITLE_WORDS)
    .join(" ")
    .replace(/[.,;:!?]+$/, "");
  const tags = [
    ...new Set(note.toLowerCase().match(/\p{L}{4,}/gu) ?? []),
  ].slice(0, MAX_TAGS);
  return {
    title,
    description: firstLine,
    tags,
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
export function fakeAnswer(options: CallOptions): NoteAnalysis {
  const note =
    schemaKeys(options) === NOTE_ANALYSIS_KEYS
      ? noteFromPrompt(promptText(options))
      : undefined;
  if (note === undefined) throw new FakeAiUnansweredError();
  return fakeNoteAnalysis(note);
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
