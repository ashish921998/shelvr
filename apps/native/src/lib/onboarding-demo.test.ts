import { describe, expect, it } from "vitest";
import { INTERESTS } from "./onboarding-interests";
import { findSample, practiceShareSample } from "./onboarding-demo";
import { SAMPLE_CITY_IDS } from "./sample-cities";

describe("practiceShareSample", () => {
  it.each([
    ["Travel", "prague.eu"],
    ["Food & recipes", "bbcgoodfood.com"],
    ["Style & shopping", "apple.com"],
    ["AI & tech", "anthropic.com"],
    ["Films, books & music", "jamesclear.com"],
  ] as const)("offers %s's page for that topic", (interest, domain) => {
    expect(practiceShareSample([interest])?.domain).toBe(domain);
  });

  it("follows the first picked topic", () => {
    expect(practiceShareSample(["AI & tech", "Travel"])?.domain).toBe(
      "anthropic.com",
    );
  });

  it("offers the reading article when no topic was picked", () => {
    expect(practiceShareSample([])?.domain).toBe("fs.blog");
  });

  it.each(INTERESTS)("finds %s's post by its link", (interest) => {
    const sample = practiceShareSample([interest]);
    expect(sample?.url).toMatch(/^https:\/\//);
    expect(findSample(sample!.url)?.pageHeading).toBe(sample?.pageHeading);
  });
});

describe("the picked city's travel post", () => {
  it("is Prague's page when no city, or Prague, was picked", () => {
    expect(practiceShareSample(["Travel"], null)?.domain).toBe("prague.eu");
    expect(practiceShareSample(["Travel"], "prague")?.domain).toBe("prague.eu");
  });

  it.each(SAMPLE_CITY_IDS.filter((city) => city !== "prague"))(
    "is a page of its own for %s, found by its link",
    (city) => {
      const sample = practiceShareSample(["Travel"], city);
      expect(sample?.city).toBe(city);
      expect(sample?.url).not.toContain("prague");
      expect(findSample(sample!.url)?.pageHeading).toBe(sample?.pageHeading);
    },
  );

  it("leaves another topic's post alone", () => {
    expect(practiceShareSample(["AI & tech"], "tokyo")?.city).toBeUndefined();
  });
});
