import { describe, expect, it } from "vitest";

import { isCutOffXPreview } from "./x-preview";

const post = "https://x.com/jasonzhou1993/status/2099837130927427989";

describe("isCutOffXPreview", () => {
  it("flags an X post whose text ends in the reader's ellipsis", () => {
    expect(isCutOffXPreview({ url: post, content: "Across Playkit,…" })).toBe(
      true,
    );
    expect(isCutOffXPreview({ url: post, content: "Across Playkit,…\n" })).toBe(
      true,
    );
  });

  it("leaves complete X text alone", () => {
    expect(isCutOffXPreview({ url: post, content: "The whole post." })).toBe(
      false,
    );
    expect(isCutOffXPreview({ url: post })).toBe(false);
  });

  it("ignores other sites and X pages that are not posts", () => {
    expect(
      isCutOffXPreview({ url: "https://example.com/a", content: "More…" }),
    ).toBe(false);
    expect(
      isCutOffXPreview({ url: "https://x.com/jasonzhou1993", content: "Bio…" }),
    ).toBe(false);
  });
});
