import { describe, expect, it } from "vitest";
import { demoDestination, orderDemoSamples } from "./onboarding-demo";

describe("orderDemoSamples", () => {
  it("puts the picked kinds' samples first", () => {
    expect(
      orderDemoSamples(["Fitness", "Articles", "Travel"]).map((s) => s.domain),
    ).toEqual(["paulgraham.com", "lonelyplanet.com", "bbcgoodfood.com"]);
  });

  it("offers three samples when no picked kind has one", () => {
    expect(orderDemoSamples(["Videos"]).map((s) => s.domain)).toEqual([
      "bbcgoodfood.com",
      "apple.com",
      "lonelyplanet.com",
    ]);
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
