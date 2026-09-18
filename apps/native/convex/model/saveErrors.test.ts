import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import {
  IMAGE_EMPTY_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  PHOTO_LIMIT_MESSAGE,
} from "./imagePolicy";
import { SAVE_ERROR_MESSAGES, saveError, saveErrorCode } from "./saveErrors";

describe("save error classification", () => {
  it("round-trips a code through the ConvexError data the client receives", () => {
    const error = saveError("photo_limit");
    expect(error).toBeInstanceOf(ConvexError);
    expect(error.data).toEqual({
      code: "photo_limit",
      message: PHOTO_LIMIT_MESSAGE,
    });
    expect(saveErrorCode(error)).toBe("photo_limit");
  });

  it("keeps the user-visible copy the current server already throws", () => {
    // `localizeError` translates by exact English string, so moving any of
    // these silently drops back to the generic fallback on every locale.
    expect(SAVE_ERROR_MESSAGES.photo_limit).toBe(PHOTO_LIMIT_MESSAGE);
    expect(SAVE_ERROR_MESSAGES.image_too_large).toBe(IMAGE_TOO_LARGE_MESSAGE);
    expect(SAVE_ERROR_MESSAGES.image_empty).toBe(IMAGE_EMPTY_MESSAGE);
    expect(SAVE_ERROR_MESSAGES.pro_required).toBe("Pro required");
  });

  it("returns null for anything that is not a structured save error", () => {
    // What production hands the client for a plain server Error, and what
    // today's server throws for an image refusal.
    expect(saveErrorCode(new Error("Server Error"))).toBeNull();
    expect(saveErrorCode(new ConvexError(PHOTO_LIMIT_MESSAGE))).toBeNull();
    expect(
      saveErrorCode(new ConvexError({ code: "not_a_save_code" })),
    ).toBeNull();
    expect(
      saveErrorCode(
        new ConvexError({ kind: "RateLimited", name: "itemCreate" }),
      ),
    ).toBeNull();
    expect(saveErrorCode(undefined)).toBeNull();
    expect(saveErrorCode("pro_required")).toBeNull();
  });
});
