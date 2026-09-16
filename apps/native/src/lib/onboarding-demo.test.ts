import { describe, expect, it } from "vitest";
import {
  demoDestination,
  orderDemoSamples,
  orderShareDemoSamples,
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

describe("orderShareDemoSamples", () => {
  it("leads with the reading article, then the picked kinds", () => {
    expect(
      orderShareDemoSamples(["Recipes", "Travel"]).map((s) => s.domain),
    ).toEqual(["fs.blog", "bbcgoodfood.com", "lonelyplanet.com"]);
  });

  it("does not repeat the article when Articles was picked", () => {
    expect(
      orderShareDemoSamples(["Articles", "Products"]).map((s) => s.domain),
    ).toEqual(["fs.blog", "apple.com", "bbcgoodfood.com"]);
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
