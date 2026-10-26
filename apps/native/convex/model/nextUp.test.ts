import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { nextUpKind } from "./nextUp";
import {
  COOK_MIN_AGE_MS,
  READ_MAX_AGE_MS,
  READ_MIN_AGE_MS,
} from "./saveReminders";

const NOW = 1_800_000_000_000;

function savedAgo(age: number, fields: Partial<Doc<"items">> = {}) {
  return {
    _id: "item" as Id<"items">,
    _creationTime: NOW - age,
    userId: "user",
    type: "link",
    status: "ready",
    tags: [],
    searchText: "",
    ...fields,
  } satisfies Doc<"items">;
}

const recipe: Partial<Doc<"items">> = {
  recipe: { ingredients: ["flour"], steps: ["bake"] },
};
const article = {
  url: "https://blog.example.com/post",
  content: "A long read.",
};

describe("nextUpKind", () => {
  it("offers a recipe to cook once it is old enough, at any later age", () => {
    expect(nextUpKind(savedAgo(COOK_MIN_AGE_MS - 1, recipe), NOW)).toBe(
      undefined,
    );
    expect(nextUpKind(savedAgo(COOK_MIN_AGE_MS, recipe), NOW)).toBe("cook");
    expect(nextUpKind(savedAgo(READ_MAX_AGE_MS + 1, recipe), NOW)).toBe("cook");
  });

  it("offers anything else only inside the read window", () => {
    expect(nextUpKind(savedAgo(READ_MIN_AGE_MS - 1, article), NOW)).toBe(
      undefined,
    );
    expect(nextUpKind(savedAgo(READ_MIN_AGE_MS, article), NOW)).toBe("read");
    expect(nextUpKind(savedAgo(READ_MAX_AGE_MS, article), NOW)).toBe("read");
    expect(nextUpKind(savedAgo(READ_MAX_AGE_MS + 1, article), NOW)).toBe(
      undefined,
    );
  });

  it("asks to watch a YouTube link or a save with a video", () => {
    expect(
      nextUpKind(
        savedAgo(READ_MIN_AGE_MS, { url: "https://youtu.be/abc" }),
        NOW,
      ),
    ).toBe("watch");
    expect(
      nextUpKind(
        savedAgo(READ_MIN_AGE_MS, {
          type: "image",
          media: [
            {
              kind: "video",
              imageUrl: "https://cdn.example.com/poster.jpg",
              aspectRatio: 1,
            },
          ],
        }),
        NOW,
      ),
    ).toBe("watch");
  });

  it("asks to open a save with nothing to read or watch", () => {
    expect(
      nextUpKind(savedAgo(READ_MIN_AGE_MS, { type: "note", note: "x" }), NOW),
    ).toBe("open");
  });
});
