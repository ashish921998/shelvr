import type { OracleMode } from "@/lib/oracle";

/**
 * What a shared verdict carries: the mode, persona, tagline, spaces and
 * Someday score (absent from links made before it existed). The
 * per-item guesses stay out, because they describe what the sharer saved.
 * The share link holds this in `?c=`, so nothing is stored server side.
 */
export type SharedVerdict = {
  mode: OracleMode;
  persona: string;
  tagline: string;
  spaces: { name: string; reason: string }[];
  score?: number;
};

const MODES: readonly OracleMode[] = ["links", "screenshot", "tabs", "library"];
const MAX_CODE_LENGTH = 4096;
const MAX_PERSONA = 80;
const MAX_TAGLINE = 200;
const MAX_SPACE_NAME = 40;
const MAX_SPACE_REASON = 140;
const MAX_SPACES = 3;

type Wire = {
  m: string;
  p: string;
  t: string;
  s: [string, string][];
  n?: number;
};

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max
    ? `${trimmed.slice(0, max - 1).trimEnd()}…`
    : trimmed;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Clips each field to its limit, so any model output fits in a link. */
export function encodeSharedVerdict(verdict: SharedVerdict): string {
  const wire: Wire = {
    m: verdict.mode,
    p: clip(verdict.persona, MAX_PERSONA),
    t: clip(verdict.tagline, MAX_TAGLINE),
    s: verdict.spaces
      .slice(0, MAX_SPACES)
      .map((space) => [
        clip(space.name, MAX_SPACE_NAME),
        clip(space.reason, MAX_SPACE_REASON),
      ]),
    ...(isScore(verdict.score) ? { n: verdict.score } : {}),
  };
  return toBase64Url(JSON.stringify(wire));
}

function isScore(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 100
  );
}

function boundedText(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() !== "" && value.length <= max
    ? value
    : undefined;
}

export function decodeSharedVerdict(code: string): SharedVerdict | undefined {
  if (code.length === 0 || code.length > MAX_CODE_LENGTH) return undefined;
  let wire: unknown;
  try {
    wire = JSON.parse(fromBase64Url(code));
  } catch {
    return undefined;
  }
  if (typeof wire !== "object" || wire === null) return undefined;
  const { m, p, t, s, n } = wire as Partial<Record<keyof Wire, unknown>>;
  const mode = MODES.find((candidate) => candidate === m);
  const persona = boundedText(p, MAX_PERSONA);
  const tagline = boundedText(t, MAX_TAGLINE);
  if (!mode || !persona || !tagline) return undefined;
  if (!Array.isArray(s) || s.length > MAX_SPACES) return undefined;
  if (n !== undefined && !isScore(n)) return undefined;
  const spaces: SharedVerdict["spaces"] = [];
  for (const entry of s) {
    if (!Array.isArray(entry) || entry.length !== 2) return undefined;
    const name = boundedText(entry[0], MAX_SPACE_NAME);
    const reason = boundedText(entry[1], MAX_SPACE_REASON);
    if (!name || !reason) return undefined;
    spaces.push({ name, reason });
  }
  return {
    mode,
    persona,
    tagline,
    spaces,
    ...(n === undefined ? {} : { score: n }),
  };
}

/** The share page for one verdict, relative to the site origin. */
export function sharedVerdictPath(verdict: SharedVerdict): string {
  return `/oracle/s?c=${encodeSharedVerdict(verdict)}`;
}

/** The verdict's card image. `story` is the 9:16 cut for saving and posting;
 * the default is the 1200×630 link preview. */
export function sharedVerdictImagePath(code: string, format?: "story"): string {
  return `/oracle/og?c=${code}${format ? `&format=${format}` : ""}`;
}
