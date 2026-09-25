import { v, type Infer } from "convex/values";
import { z } from "zod";

export const ORACLE_MAX_URLS = 3;
export const ORACLE_MAX_TITLES = 5;
export const ORACLE_MAX_ROWS = 40;
// Node actions take at most 5 MiB of arguments, so a screenshot is capped at
// 3 MiB of image, which is 4 MiB once base64 encoded.
export const ORACLE_MAX_IMAGE_BASE64_CHARS = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 300;
const MAX_URL_CHARS = 2048;
const MAX_TAB_COUNT = 100_000;

const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const oracleInputValidator = v.union(
  v.object({ kind: v.literal("links"), urls: v.array(v.string()) }),
  v.object({
    kind: v.literal("screenshot"),
    imageBase64: v.string(),
    mediaType: v.union(...IMAGE_MEDIA_TYPES.map((type) => v.literal(type))),
  }),
  v.object({
    kind: v.literal("tabs"),
    count: v.number(),
    titles: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("library"),
    // savedAt and oldestAt are epoch milliseconds.
    rows: v.array(
      v.object({
        label: v.string(),
        domain: v.string(),
        savedAt: v.optional(v.number()),
      }),
    ),
    stats: v.object({
      count: v.number(),
      oldestAt: v.optional(v.number()),
      topDomains: v.array(v.string()),
    }),
  }),
);

export const oracleVerdictValidator = v.object({
  persona: v.string(),
  tagline: v.string(),
  spaces: v.array(v.object({ name: v.string(), reason: v.string() })),
  guesses: v.array(v.object({ label: v.string(), why: v.string() })),
});

export type OracleInput = Infer<typeof oracleInputValidator>;
export type OracleKind = OracleInput["kind"];
export type OracleInputOf<K extends OracleKind> = Extract<
  OracleInput,
  { kind: K }
>;
export type OracleVerdict = Infer<typeof oracleVerdictValidator>;

export const oracleVerdictSchema = z.object({
  persona: z
    .string()
    .describe(
      "The visitor's saver persona, 2-5 words in Title Case, e.g. 'The Someday Chef'.",
    ),
  tagline: z
    .string()
    .describe("One warm, teasing sentence about them, at most 140 characters."),
  spaces: z
    .array(
      z.object({
        name: z.string().describe("A short space name, 1-3 words."),
        reason: z
          .string()
          .describe("One short sentence on what this space would hold."),
      }),
    )
    .length(3)
    .describe("Exactly 3 spaces Shelvr would build for them."),
  guesses: z
    .array(
      z.object({
        label: z.string().describe("What this is, in a few words."),
        why: z.string().describe("One sentence guessing why they kept it."),
      }),
    )
    .describe("One guess per item, in the order the items were given."),
});

type Fields = Record<string, unknown>;

function boundedString(value: unknown, max = MAX_TEXT_CHARS) {
  return typeof value === "string" && value.trim() !== "" && value.length <= max
    ? value.trim()
    : undefined;
}

function optionalNumber(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function everyOrNone<T>(
  values: unknown,
  max: number,
  parse: (value: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(values) || values.length > max) return undefined;
  const parsed = values.map((value) => parse(value));
  return parsed.every((value) => value !== undefined)
    ? (parsed as T[])
    : undefined;
}

function httpsUrl(value: unknown): string | undefined {
  const text = boundedString(value, MAX_URL_CHARS);
  if (!text) return undefined;
  try {
    return new URL(text).protocol === "https:" ? text : undefined;
  } catch {
    return undefined;
  }
}

function libraryRow(value: unknown) {
  if (typeof value !== "object" || value === null) return undefined;
  const { label, domain, savedAt } = value as Fields;
  const parsedLabel = boundedString(label);
  const parsedDomain = boundedString(domain, 253);
  const parsedSavedAt = optionalNumber(savedAt);
  if (!parsedLabel || !parsedDomain || parsedSavedAt === null) return undefined;
  return {
    label: parsedLabel,
    domain: parsedDomain,
    ...(parsedSavedAt === undefined ? {} : { savedAt: parsedSavedAt }),
  };
}

function libraryStats(value: unknown) {
  if (typeof value !== "object" || value === null) return undefined;
  const { count, oldestAt, topDomains } = value as Fields;
  const parsedOldest = optionalNumber(oldestAt);
  const domains = everyOrNone(topDomains, 3, (domain) =>
    boundedString(domain, 253),
  );
  if (!Number.isInteger(count) || (count as number) < 0) return undefined;
  if (parsedOldest === null || !domains) return undefined;
  return {
    count: count as number,
    ...(parsedOldest === undefined ? {} : { oldestAt: parsedOldest }),
    topDomains: domains,
  };
}

// One parser per kind. Each builds a fresh object from known fields, so an
// extra property on the wire never reaches the action's argument validator.
const inputParsers: {
  [K in OracleKind]: (body: Fields) => OracleInputOf<K> | undefined;
} = {
  links: (body) => {
    const urls = everyOrNone(body.urls, ORACLE_MAX_URLS, httpsUrl);
    return urls && urls.length > 0 ? { kind: "links", urls } : undefined;
  },
  screenshot: (body) => {
    const { imageBase64, mediaType } = body;
    if (
      typeof imageBase64 !== "string" ||
      imageBase64.length === 0 ||
      imageBase64.length > ORACLE_MAX_IMAGE_BASE64_CHARS ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)
    ) {
      return undefined;
    }
    const type = IMAGE_MEDIA_TYPES.find((t) => t === mediaType);
    return type
      ? { kind: "screenshot", imageBase64, mediaType: type }
      : undefined;
  },
  tabs: (body) => {
    const { count } = body;
    const titles = everyOrNone(body.titles, ORACLE_MAX_TITLES, boundedString);
    if (!Number.isInteger(count) || (count as number) < 0) return undefined;
    if ((count as number) > MAX_TAB_COUNT || !titles) return undefined;
    return { kind: "tabs", count: count as number, titles };
  },
  library: (body) => {
    const rows = everyOrNone(body.rows, ORACLE_MAX_ROWS, libraryRow);
    const stats = libraryStats(body.stats);
    return rows && rows.length > 0 && stats
      ? { kind: "library", rows, stats }
      : undefined;
  },
};

function isOracleKind(value: unknown): value is OracleKind {
  return typeof value === "string" && Object.hasOwn(inputParsers, value);
}

export function parseOracleInput(body: unknown): OracleInput | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  const fields = body as Fields;
  if (!isOracleKind(fields.kind)) return undefined;
  return inputParsers[fields.kind](fields);
}
