import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import {
  IMAGE_EMPTY_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  PHOTO_LIMIT_MESSAGE,
} from "./imagePolicy";
import {
  SAVE_ERROR_MESSAGES,
  saveError,
  saveErrorCode,
  saveFailureStage,
} from "./saveErrors";

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

describe("save failure stages", () => {
  it("prefers the structured code and bounds everything else to `other`", () => {
    expect(saveFailureStage(saveError("image_empty"))).toBe("image_empty");
    expect(saveFailureStage(new ConvexError({ code: "not_a_save_code" }))).toBe(
      "other",
    );
    expect(saveFailureStage(new Error("network unavailable"))).toBe("other");
    expect(saveFailureStage(undefined)).toBe("other");
  });

  it("recognizes a plain Error carrying a fixed refusal sentence", () => {
    // The legacy transport shape (a sentence straight in ConvexError data)
    // and the pipeline stages that rethrow a returned error string: the
    // sentence is the only signal, and matching the canonical table keeps
    // the stage bounded. The sentences themselves are pinned to the constants
    // by the copy test above.
    expect(saveFailureStage(new ConvexError(PHOTO_LIMIT_MESSAGE))).toBe(
      "photo_limit",
    );
    expect(
      saveFailureStage(new Error(SAVE_ERROR_MESSAGES.image_too_large)),
    ).toBe("image_too_large");
    expect(saveFailureStage(new Error(SAVE_ERROR_MESSAGES.photo_limit))).toBe(
      "photo_limit",
    );
    expect(saveFailureStage(new Error(SAVE_ERROR_MESSAGES.pro_required))).toBe(
      "pro_required",
    );
  });
});
