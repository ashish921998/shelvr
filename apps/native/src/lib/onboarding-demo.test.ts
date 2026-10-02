import { describe, expect, it } from "vitest";
import {
  demoDestination,
  orderDemoSamples,
  practiceShareSample,
} from "./onboarding-demo";

describe("orderDemoSamples", () => {
  it("puts the picked kinds' samples first", () => {
    expect(
      orderDemoSamples(["Fitness", "Articles", "Travel"]).map((s) => s.domain),
    ).toEqual(["fs.blog", "lonelyplanet.com", "bbcgoodfood.com"]);
  });

  it("offers three samples when no picked kind has one", () => {
    expect(orderDemoSamples(["Videos"]).map((s) => s.domain)).toEqual([
      "bbcgoodfood.com",
      "apple.com",
      "lonelyplanet.com",
    ]);
  });
});

describe("practiceShareSample", () => {
  it("uses the reading article when the demo saved something else", () => {
    expect(
      practiceShareSample(
        ["Recipes"],
        "https://www.bbcgoodfood.com/recipes/classic-lasagne",
      )?.domain,
    ).toBe("fs.blog");
  });

  it("uses the reading article when nothing was saved", () => {
    expect(practiceShareSample(["Travel"], null)?.domain).toBe("fs.blog");
  });

  it("falls back to a picked kind when the article was the demo save", () => {
    expect(
      practiceShareSample(["Travel", "Recipes"], "https://fs.blog/reading/")
        ?.domain,
    ).toBe("lonelyplanet.com");
  });
});

describe("demoDestination", () => {
  const travelUrl =
    "https://www.lonelyplanet.com/articles/best-things-to-do-in-prague";

  it("files a sample into its kind's first preset when kept", () => {
    expect(demoDestination(travelUrl, ["Trip ideas", "Travel"])).toBe("Travel");
  });

  it("leaves the sample unfiled when the preset was removed", () => {
    expect(demoDestination(travelUrl, ["Trip ideas"])).toBeNull();
  });

  it("never files an arbitrary shared link", () => {
    expect(demoDestination("https://example.com/post", ["Travel"])).toBeNull();
  });
});
