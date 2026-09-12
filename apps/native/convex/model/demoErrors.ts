import { ConvexError } from "convex/values";

// User-facing failures of the onboarding demo (`convex/demo.ts`). Every one is
// thrown as a ConvexError with this structured `data`, never as a plain Error:
// production redacts a plain Error's message to "Server Error", so a client
// branch on `err.message` silently stops firing once deployed. The client
// branches on `demoErrorCode(err)` instead. This module has no server-runtime
// imports so the native app can load it as `@convex/model/demoErrors`.

export const DEMO_ERROR_CODES = [
  // The allowance is spent and its item no longer belongs to the caller.
  "demo_used",
  // retryDemoItem without a demo row for the caller.
  "no_demo",
  // The pipeline judged the failure terminal (missing page); a retry cannot
  // change the result, so none is scheduled and no retry budget is spent.
  "terminal_failure",
  // MAX_DEMO_RETRIES reached across rate-limit windows.
  "too_many_retries",
  "invalid_space_name",
] as const;

export type DemoErrorCode = (typeof DEMO_ERROR_CODES)[number];

export type DemoErrorData = { code: DemoErrorCode; message: string };

export const DEMO_ERROR_MESSAGES: Record<DemoErrorCode, string> = {
  demo_used: "Demo save already used",
  no_demo: "No demo save",
  terminal_failure:
    "This page could not be found; retrying would not change the result",
  too_many_retries: "Too many retries",
  invalid_space_name: "Invalid space name",
};

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

/** The demo error code carried by a thrown value, or null for anything else
 * (a redacted server error, a network failure, a rate limit…). */
export function demoErrorCode(error: unknown): DemoErrorCode | null {
  const code = errorData(error)?.code;
  return typeof code === "string" &&
    (DEMO_ERROR_CODES as readonly string[]).includes(code)
    ? (code as DemoErrorCode)
    : null;
}

/** `@convex-dev/rate-limiter` throws a ConvexError whose data is
 * `{ kind: "RateLimited", name, retryAfter }` when called with `throws: true`. */
export function isRateLimitedError(error: unknown): boolean {
  return errorData(error)?.kind === "RateLimited";
}
