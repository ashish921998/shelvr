import { ConvexError } from "convex/values";

/** Longest message the UI will render; anything past this is a leak or a stack
 * trace, not a sentence for the user. */
const MAX_MESSAGE_LENGTH = 200;

/** The user-facing sentence a ConvexError carries, if it has one. Today's
 * server puts the sentence straight in `data`; the structured form (see
 * `@convex/model/saveErrors`) nests it under `data.message`. Reading both lets
 * this client ship before the server switches. A plain Error carries nothing
 * usable — production redacts its message to "Server Error". */
function convexErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  const data: unknown = error.data;
  if (typeof data === "string") return data;
  if (typeof data === "object" && data !== null) {
    const message = (data as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

/**
 * Maps an unknown thrown value to a short, user-safe message, falling back to
 * the caller's own copy when nothing usable came through. Never surfaces
 * upload URLs, storage ids, or backend stack traces to the UI: anything that
 * looks like a URL or an id is redacted first. Real Convex ids are long
 * unbroken lowercase-alphanumeric tokens (~32 chars, no separators), which no
 * natural-language word reaches.
 */
export function userSafeMessage(error: unknown, fallback: string): string {
  const raw =
    convexErrorMessage(error) ??
    (error instanceof Error ? error.message : undefined);
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/https?:\/\/\S+/gi, "<url>")
    .replace(/\b[a-z0-9]{25,}\b/g, "<id>")
    .slice(0, MAX_MESSAGE_LENGTH);
  return cleaned || fallback;
}
