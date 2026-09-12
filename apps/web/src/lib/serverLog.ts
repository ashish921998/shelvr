type ServerLogLevel = "warn" | "error";

/** Only scalars: a field is a category, code, status, or flag. Never a URL
 * or user input — those stay out of the hosting platform's log drain. */
type ServerLogFields = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Emit one JSON line per event from server code (route handlers, server
 * actions). A fixed `{ level, event, environment, ...fields }` shape lets
 * the log drain filter and alert on `event` instead of parsing prose.
 */
export function serverLog(
  level: ServerLogLevel,
  event: string,
  fields: ServerLogFields = {},
): void {
  const line = JSON.stringify({
    level,
    event,
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    ...fields,
  });
  if (level === "error") {
    console.error(line);
  } else {
    console.warn(line);
  }
}
