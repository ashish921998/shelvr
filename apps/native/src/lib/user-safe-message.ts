import { ConvexError } from "convex/values";

const MAX_MESSAGE_LENGTH = 200;

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
