// The single sanitizer both the image save path and the share path render
// through. Merged from the two near-identical copies that used to live in
// use-save-image.ts and share/process-share.ts.
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { saveError } from "@convex/model/saveErrors";
import { PHOTO_LIMIT_MESSAGE } from "@convex/model/imagePolicy";
import { userSafeMessage } from "./user-safe-message";

const FALLBACK = "Could not save this item";

describe("userSafeMessage", () => {
  it("unwraps the sentence today's server puts straight in ConvexError data", () => {
    expect(
      userSafeMessage(new ConvexError(PHOTO_LIMIT_MESSAGE), FALLBACK),
    ).toBe(PHOTO_LIMIT_MESSAGE);
  });

  it("unwraps the sentence the structured refusal nests under data.message", () => {
    // The share path used to render the prefixed transport string here.
    expect(userSafeMessage(saveError("photo_limit"), FALLBACK)).toBe(
      PHOTO_LIMIT_MESSAGE,
    );
  });

  it("redacts URLs and Convex ids leaked through a plain Error", () => {
    // Realistic Convex ids: long unbroken lowercase-alphanumeric tokens.
    const storageId = "kg2e5gqf40sy8kdqxcm3vp7hn96wtxyz";
    const error = new Error(
      `POST https://upload.convex.cloud/abc failed for ${storageId}`,
    );
    expect(userSafeMessage(error, FALLBACK)).toBe("POST <url> failed for <id>");
  });

  it("caps the message at 200 characters", () => {
    const message = userSafeMessage(new Error("word ".repeat(100)), FALLBACK);
    expect(message).toHaveLength(200);
  });

  it("falls back to the caller's copy when nothing usable came through", () => {
    expect(userSafeMessage("a bare string", FALLBACK)).toBe(FALLBACK);
    expect(userSafeMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(userSafeMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
    expect(userSafeMessage(new ConvexError(""), FALLBACK)).toBe(FALLBACK);
  });
});
