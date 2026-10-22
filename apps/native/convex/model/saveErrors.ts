import { ConvexError } from "convex/values";
import {
  IMAGE_EMPTY_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  PHOTO_LIMIT_MESSAGE,
} from "./imagePolicy";

// Throw as ConvexError with this data: production redacts a plain Error message.
export const SAVE_ERROR_CODES = [
  "pro_required",
  "photo_limit",
  "image_too_large",
  "image_empty",
] as const;

export type SaveErrorCode = (typeof SAVE_ERROR_CODES)[number];

type SaveErrorData = { code: SaveErrorCode; message: string };

export const SAVE_ERROR_MESSAGES: Record<SaveErrorCode, string> = {
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

export type SaveFailureStage = SaveErrorCode | "other";

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
