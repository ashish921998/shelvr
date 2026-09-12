import { env } from "../_generated/server";

export type LogLevel = "info" | "warn" | "error";

/** Only scalars: a field is a category, code, id, count, or flag. Never a
 * message, URL, or user content — those stay out of the log stream. */
export type LogFieldValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogFieldValue>;

/**
 * Emit one JSON line per event. Convex forwards console output to the
 * dashboard and to any configured log stream (Axiom, Datadog, webhook), so a
 * fixed `{ level, event, environment, ...fields }` shape lets those tools
 * filter and alert on `event` instead of parsing prose. `level` picks the
 * console method so Convex's own severity filter and existing test spies keep
 * working; `undefined` fields are dropped by JSON.stringify.
 */
export function logEvent(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const line = JSON.stringify({
    level,
    event,
    environment: env.OBSERVABILITY_ENV ?? "development",
    ...fields,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** Constructor name of a thrown value, or its `typeof`. Safe to log: the
 * class (TypeError, ConvexError, ...) carries no request or user data, while
 * a message can echo validated args. */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
