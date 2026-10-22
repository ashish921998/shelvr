import { env } from "../_generated/server";

type LogLevel = "info" | "warn" | "error";

type LogFieldValue = string | number | boolean | null | undefined;
type LogFields = Record<string, LogFieldValue>;

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

export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
