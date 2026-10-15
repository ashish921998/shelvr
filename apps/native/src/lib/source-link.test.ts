import { describe, expect, it } from "vitest";
import { withoutSourceLink } from "./source-link";

const reel = "https://www.instagram.com/reel/abc123/?igsh=xyz";

describe("withoutSourceLink", () => {
  it("drops an open action for the save's own page, however it is spelled", () => {
    const intents = [
      { kind: "open_url", value: "https://instagram.com/reel/abc123" },
      { kind: "web_search", value: "@culinarychaser" },
    ];
    expect(withoutSourceLink(intents, reel)).toEqual([
      { kind: "web_search", value: "@culinarychaser" },
    ]);
  });

  it("keeps open actions for other pages and every other kind", () => {
    const intents = [
      { kind: "open_url", value: "https://example.com/recipe" },
      { kind: "copy", value: reel },
    ];
    expect(withoutSourceLink(intents, reel)).toEqual(intents);
  });

  it("tells pages apart by their identifying query, not their share tracking", () => {
    const video = "https://www.youtube.com/watch?v=first&si=share";
    const intents = [
      { kind: "open_url", value: "https://youtube.com/watch?v=second" },
      { kind: "open_url", value: "https://youtube.com/watch?v=first" },
    ];
    expect(withoutSourceLink(intents, video)).toEqual([intents[0]]);
  });

  it("keeps everything when the save has no usable URL", () => {
    const intents = [{ kind: "open_url", value: reel }];
    expect(withoutSourceLink(intents, undefined)).toEqual(intents);
    expect(withoutSourceLink(intents, "not a url")).toEqual(intents);
  });
});
