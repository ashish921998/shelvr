import { ConvexError } from "convex/values";
import {
  IMAGE_EMPTY_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  PHOTO_LIMIT_MESSAGE,
} from "./imagePolicy";

// Refusals of a save the user can act on: buy Pro, delete photos, pick a
// smaller file. Every one is meant to be thrown as a ConvexError with this
// structured `data`, never as a plain Error and never as a bare sentence:
// production redacts a plain Error's message to "Server Error", so a client
// branch on `err.message` silently stops firing once deployed, and editing a
// sentence silently re-buckets analytics on every installed client (the
// backend deploys before them). The client branches on `saveErrorCode(err)`
// instead. This module has no server-runtime imports so the native app can
// load it as `@convex/model/saveErrors`.

export const SAVE_ERROR_CODES = [
  // No active trial or subscription. The client opens the paywall.
  "pro_required",
  // MAX_PHOTOS_PER_ACCOUNT already held by this account.
  "photo_limit",
  // Over MAX_STORED_IMAGE_BYTES.
  "image_too_large",
  // A zero-byte upload.
  "image_empty",
] as const;

export type SaveErrorCode = (typeof SAVE_ERROR_CODES)[number];

export type SaveErrorData = { code: SaveErrorCode; message: string };

/** Byte-identical to the sentences the server throws. `localizeError` keys its
 * translations off them, so user-visible copy must not move. */
export const SAVE_ERROR_MESSAGES: Record<SaveErrorCode, string> = {
  // Never rendered — the client opens the paywall — and production redacts it
  // anyway. Mirrors `PRO_REQUIRED` in `subscriptions.ts`.
  pro_required: "Pro required",
  photo_limit: PHOTO_LIMIT_MESSAGE,
  image_too_large: IMAGE_TOO_LARGE_MESSAGE,
  image_empty: IMAGE_EMPTY_MESSAGE,
};

export function saveError(code: SaveErrorCode): ConvexError<SaveErrorData> {
  return new ConvexError<SaveErrorData>({
    code,
    message: SAVE_ERROR_MESSAGES[code],
  });
}

/** The save error code carried by a thrown value, or null for anything else:
 * a redacted server error, a network failure, or an error without `data`. */
export function saveErrorCode(error: unknown): SaveErrorCode | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null) return null;
  const code = (data as Record<string, unknown>).code;
  return typeof code === "string" &&
    (SAVE_ERROR_CODES as readonly string[]).includes(code)
    ? (code as SaveErrorCode)
    : null;
}

/** The bounded failure stage a `save_failed` event reports: one of the
 * refusal codes above, or `other` for everything else — a network failure, a
 * redacted server error, or a thrown non-Error. */
export type SaveFailureStage = SaveErrorCode | "other";

/** Buckets a failed save submission for analytics. Prefers the structured
 * code, so a copy edit on the server cannot re-bucket every installed client.
 * The message comparison is the fallback for a plain Error carrying a fixed
 * refusal sentence — the legacy transport shape, or a stage that rethrows a
 * returned error string — and matches the canonical sentences above so the
 * stage stays bounded. Production redaction sends most of those to `other`,
 * which is the honest answer for an unknowable failure. */
export function saveFailureStage(error: unknown): SaveFailureStage {
  const code = saveErrorCode(error);
  if (code !== null) return code;
  if (error instanceof Error) {
    for (const candidate of SAVE_ERROR_CODES) {
      if (error.message === SAVE_ERROR_MESSAGES[candidate]) return candidate;
    }
  }
  return "other";
}
