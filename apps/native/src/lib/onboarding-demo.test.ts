import { describe, expect, it } from "vitest";
import { demoDestination, pickDemoSample } from "./onboarding-demo";

describe("pickDemoSample", () => {
  it("uses the first picked kind that has a sample", () => {
    expect(pickDemoSample(["Fitness", "Recipes", "Articles"]).url).toBe(
      "https://www.bbcgoodfood.com/recipes/classic-lasagne",
    );
  });

  it("falls back to the Prague travel article", () => {
    expect(pickDemoSample(["Videos"]).url).toBe(
      "https://www.lonelyplanet.com/articles/best-things-to-do-in-prague",
    );
    expect(pickDemoSample([]).domain).toBe("lonelyplanet.com");
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
