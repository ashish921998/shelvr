import { ConvexError } from "convex/values";

export const MAX_DEMO_RETRIES = 5;

const DEMO_ERROR_CODES = [
  "demo_used",
  "no_demo",
  "terminal_failure",
  "too_many_retries",
  "invalid_space_name",
] as const;

type DemoErrorCode = (typeof DEMO_ERROR_CODES)[number];

type DemoErrorData = { code: DemoErrorCode; message: string };

export const DEMO_ERROR_MESSAGES: Record<DemoErrorCode, string> = {
  demo_used: "Demo save already used",
  no_demo: "No demo save",
  terminal_failure:
    "This page could not be found; retrying would not change the result",
  too_many_retries: "Too many retries",
  invalid_space_name: "Invalid space name",
};

// Production redacts a plain Error's message to "Server Error", so these carry structured ConvexError data.
export function demoError(code: DemoErrorCode): ConvexError<DemoErrorData> {
  return new ConvexError<DemoErrorData>({
    code,
    message: DEMO_ERROR_MESSAGES[code],
  });
}

function errorData(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)
    : null;
}

export function demoErrorCode(error: unknown): DemoErrorCode | null {
  const code = errorData(error)?.code;
  return typeof code === "string" &&
    (DEMO_ERROR_CODES as readonly string[]).includes(code)
    ? (code as DemoErrorCode)
    : null;
}

/** With `throws: true`, `@convex-dev/rate-limiter` throws a ConvexError whose data is `{ kind: "RateLimited", name, retryAfter }`. */
export function isRateLimitedError(error: unknown): boolean {
  return errorData(error)?.kind === "RateLimited";
}
