import { v, type Infer } from "convex/values";

export const resendErrorCategoryValidator = v.union(
  v.literal("rate_limited"),
  v.literal("invalid_request"),
  v.literal("invalid_recipient"),
  v.literal("auth_error"),
  v.literal("provider_error"),
  v.literal("timeout"),
  v.literal("network_error"),
);
type ResendErrorCategory = Infer<typeof resendErrorCategoryValidator>;

export class ResendResponseError extends Error {
  constructor(
    readonly label: string,
    readonly status: number,
  ) {
    super(`Resend ${label} failed (${status}).`);
    this.name = "ResendResponseError";
  }
}

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
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return { category: "timeout", status: undefined };
  }
  return { category: "network_error", status: undefined };
}

export function formatResendError(
  category: ResendErrorCategory,
  status: number | undefined,
): string {
  return status === undefined ? category : `${category}:${status}`;
}

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
