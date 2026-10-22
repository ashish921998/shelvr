import { describe, expect, it } from "vitest";
import {
  demoDestination,
  featuredDemoKind,
  findSample,
  orderDemoSamples,
  practiceShareSample,
} from "./onboarding-demo";
import { SAMPLE_CITY_IDS } from "./sample-cities";

describe("orderDemoSamples", () => {
  it("puts the picked kinds' samples first", () => {
    expect(
      orderDemoSamples(["Fitness", "Articles", "Travel"]).map((s) => s.domain),
    ).toEqual(["fs.blog", "prague.eu", "bbcgoodfood.com"]);
  });

  it("offers three samples when no picked kind has one", () => {
    expect(orderDemoSamples(["Fitness"]).map((s) => s.domain)).toEqual([
      "bbcgoodfood.com",
      "apple.com",
      "prague.eu",
    ]);
  });
});

describe("samples for picked topics", () => {
  it("follows the first picked kind's sample with the topics' samples", () => {
    expect(
      orderDemoSamples(
        ["Recipes", "Travel"],
        ["AI & tech", "Films, books & music"],
      ).map((s) => s.domain),
    ).toEqual(["bbcgoodfood.com", "anthropic.com", "jamesclear.com"]);
  });

  it("leads with a topic when no picked kind has a sample", () => {
    expect(orderDemoSamples(["Fitness"], ["AI & tech"])[0]?.domain).toBe(
      "anthropic.com",
    );
    expect(featuredDemoKind(["Fitness"], ["AI & tech"])).toBe("Articles");
  });

  it.each([
    ["Food & recipes", "bbcgoodfood.com", "Recipes"],
    ["Style & shopping", "apple.com", "Products"],
  ] as const)(
    "names %s's shared sample by its kind when it leads",
    (interest, domain, kind) => {
      expect(orderDemoSamples(["Fitness"], [interest])[0]?.domain).toBe(domain);
      expect(featuredDemoKind(["Fitness"], [interest])).toBe(kind);
    },
  );

  it("shows a page once when a kind and a topic both offer it", () => {
    const domains = orderDemoSamples(
      ["Travel"],
      ["Travel", "Food & recipes"],
    ).map((s) => s.domain);
    expect(domains).toEqual(["prague.eu", "bbcgoodfood.com", "apple.com"]);
  });

  it("files a topic's sample into that topic's space when it was kept", () => {
    const url = "https://www.anthropic.com/research/building-effective-agents";
    expect(demoDestination(url, ["AI & tech", "Articles"])).toBe("AI & tech");
    expect(demoDestination(url, ["Articles"])).toBe("Articles");
    expect(demoDestination(url, [])).toBeNull();
  });

  it("files a page a topic shares with a kind into the topic's space", () => {
    const url = "https://www.bbcgoodfood.com/recipes/classic-lasagne";
    expect(demoDestination(url, ["Food & recipes", "Recipes"])).toBe(
      "Food & recipes",
    );
    expect(demoDestination(url, ["Recipes"])).toBe("Recipes");
  });
});

describe("featuredDemoKind", () => {
  it("names the leading sample's kind when setup picked it", () => {
    expect(featuredDemoKind(["Fitness", "Videos", "Recipes"])).toBe("Videos");
  });

  it("is null when nothing picked has a sample", () => {
    expect(featuredDemoKind(["Fitness"])).toBeNull();
    expect(featuredDemoKind([])).toBeNull();
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
    ).toBe("prague.eu");
  });
});

describe("demoDestination", () => {
  const travelUrl =
    "https://www.prague.eu/en/objevujte/old-town-square-staromestske-namesti/";

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

describe("the picked city's travel sample", () => {
  const travel = (city: (typeof SAMPLE_CITY_IDS)[number] | null) =>
    orderDemoSamples(["Travel"], ["Travel"], city).filter(
      (sample) => sample.kind === "Travel",
    );

  it("is Prague's page when no city, or Prague, was picked", () => {
    expect(travel(null).map((sample) => sample.domain)).toEqual(["prague.eu"]);
    expect(travel("prague").map((sample) => sample.domain)).toEqual([
      "prague.eu",
    ]);
  });

  it.each(SAMPLE_CITY_IDS.filter((city) => city !== "prague"))(
    "is a page of its own for %s, shown once and found by its link",
    (city) => {
      const [sample, ...rest] = travel(city);
      expect(rest).toEqual([]);
      expect(sample?.city).toBe(city);
      expect(sample?.url).toMatch(/^https:\/\//);
      expect(sample?.url).not.toContain("prague");
      expect(findSample(sample!.url)?.pageHeading).toBe(sample?.pageHeading);
      expect(demoDestination(sample!.url, ["Travel"])).toBe("Travel");
    },
  );

  it("leaves the other kinds' samples alone", () => {
    expect(
      orderDemoSamples(["Recipes", "Travel"], [], "tokyo").map(
        (sample) => sample.city ?? sample.kind,
      ),
    ).toEqual(["Recipes", "tokyo", "Products"]);
  });

  it("is what the share practice offers after another save", () => {
    const article = practiceShareSample(["Travel"], null, "tokyo");
    expect(article?.kind).toBe("Articles");
    expect(practiceShareSample(["Travel"], article!.url, "tokyo")?.city).toBe(
      "tokyo",
    );
  });
});
