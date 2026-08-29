"use node";

import {
  isSafeFetchError,
  type SafeFetchError,
} from "./safeFetch";

/** A stable page-read failure that never carries request or response data. */
export class PageFetchError extends Error {
  constructor(
    public readonly code: SafeFetchError,
    /** HTTP status when `code` is `http_error`. */
    public readonly status?: number,
  ) {
    super(`page fetch failed: ${code}`);
    this.name = "PageFetchError";
  }
}

/**
 * Reduce external-read failures to categories safe for logs. Never include an
 * error message or cause: either may contain a URL, API key, response body, or
 * resolved network address.
 */
export function summarizeExternalError(error: unknown): string {
  if (error instanceof PageFetchError) {
    return `page_fetch_error:${error.code}`;
  }
  if (isSafeFetchError(error)) {
    return `safe_fetch:${error.code}`;
  }
  if (error !== null && typeof error === "object" && "name" in error) {
    return `unexpected_error:${String(error.name)}`;
  }
  return "unexpected_error";
}
