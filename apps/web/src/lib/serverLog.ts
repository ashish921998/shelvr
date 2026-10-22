type ServerLogLevel = "warn" | "error";

type ServerLogFields = Record<
  string,
  string | number | boolean | null | undefined
>;

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
