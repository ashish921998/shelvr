import { v, type Infer } from "convex/values";

/**
 * Why a Resend call failed, without the provider's message. Resend can echo
 * the submitted content (an address, a feedback message) inside its error
 * text, so the response body is never read; the category plus HTTP status is
 * enough to triage an outage. `invalid_request` (feedback sends) and
 * `invalid_recipient` (waitlist contacts) are the two surface vocabularies
 * for a rejected payload — a consumer picks its own label when classifying.
 */
export const resendErrorCategoryValidator = v.union(
  v.literal("rate_limited"),
  v.literal("invalid_request"),
  v.literal("invalid_recipient"),
  v.literal("auth_error"),
  v.literal("provider_error"),
  v.literal("timeout"),
  v.literal("network_error"),
);
export type ResendErrorCategory = Infer<typeof resendErrorCategoryValidator>;

/**
 * A Resend call that returned a non-success HTTP status. Carries only the
 * status and a short label for which call failed ("send" for the feedback
 * inbox; "create", "lookup", "segment", "topic" for the waitlist contact).
 * The response body, which can echo the submitted content, is never read
 * into the error.
 */
export class ResendResponseError extends Error {
  constructor(
    readonly label: string,
    readonly status: number,
  ) {
    super(`Resend ${label} failed (${status}).`);
    this.name = "ResendResponseError";
  }
}

/**
 * Reduce any failure from the Resend call to a fixed category and, when
 * there was an HTTP response, its status code. Consumers pass the category
 * name their surface uses for a rejected payload: waitlist contacts call
 * it "invalid_recipient", feedback sends call it "invalid_request".
 */
export function classifyResendError(
  error: unknown,
  invalidCategory: Extract<
    ResendErrorCategory,
    "invalid_request" | "invalid_recipient"
  >,
): { category: ResendErrorCategory; status: number | undefined } {
  if (error instanceof ResendResponseError) {
    const { status } = error;
    if (status === 429) return { category: "rate_limited", status };
    if (status === 401 || status === 403)
      return { category: "auth_error", status };
    if (status === 400 || status === 422) {
      return { category: invalidCategory, status };
    }
    return { category: "provider_error", status };
  }
  // `AbortSignal.timeout` rejects with a DOMException named TimeoutError (or
  // AbortError on older runtimes).
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return { category: "timeout", status: undefined };
  }
  return { category: "network_error", status: undefined };
}

/**
 * Serialize a failure into a `<category>` or `<category>:<status>` column
 * value (status omitted when the failure never got an HTTP response).
 * Nothing from the provider's response body is included.
 */
export function formatResendError(
  category: ResendErrorCategory,
  status: number | undefined,
): string {
  return status === undefined ? category : `${category}:${status}`;
}

/**
 * One Resend API call: bearer auth, JSON, and a hard timeout so a hung
 * socket cannot stall the calling action or the retry worker. `userAgent`
 * is the caller's own so provider-side metrics keep distinguishing surfaces.
 */
export async function resendRequest(
  apiKey: string,
  userAgent: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": userAgent,
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
}
