import { describe, expect, it } from "vitest";
import {
  parseReelPlacesBody,
  parseReelUrl,
  postText,
  settleReelPlaces,
} from "./reelPlaces";

const raw = (places: [string, string?][]) => ({
  places: places.map(([name, city]) => ({ name, city: city ?? "" })),
});

describe("parseReelUrl", () => {
  it.each([
    "https://www.instagram.com/reel/C8abc123/",
    "instagram.com/reel/C8abc123",
    "https://www.tiktok.com/@someone/video/7300000000000000000",
  ])("accepts %s", (url) => {
    expect(parseReelUrl(url)).toBeDefined();
  });

  it.each([
    "https://example.com/reel/1",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "http://127.0.0.1/reel/1",
    "not a url",
    "",
    42,
    undefined,
  ])("refuses %s", (url) => {
    expect(parseReelUrl(url)).toBeUndefined();
  });

  it("reads the url out of a request body", () => {
    expect(
      parseReelPlacesBody({ url: "https://www.instagram.com/reel/C8abc123/" }),
    ).toBeDefined();
    expect(parseReelPlacesBody({ link: "x" })).toBeUndefined();
    expect(parseReelPlacesBody(null)).toBeUndefined();
  });
});

describe("postText", () => {
  it("is empty when the page gave no words", () => {
    expect(postText({})).toBe("");
  });

  it("keeps the post's words and caps their length", () => {
    const text = postText({ author: "someone", content: "x".repeat(10_000) });
    expect(text).toContain("Posted by: someone");
    expect(text.length).toBeLessThanOrEqual(4_000);
  });
});

describe("settleReelPlaces", () => {
  const caption =
    "Lisbon food crawl: Time Out Market, Pastéis de Belém, @manteigaria";

  it("keeps places the text names and drops one it does not", () => {
    const settled = settleReelPlaces(
      raw([
        ["Time Out Market", "Lisbon"],
        ["Pastéis de Belém", "Lisbon"],
        ["Eiffel Tower", "Paris"],
      ]),
      caption,
    );
    expect(settled.places.map((place) => place.name)).toEqual([
      "Time Out Market",
      "Pastéis de Belém",
    ]);
  });

  it("drops a famous sight in the right city that the caption never names", () => {
    const settled = settleReelPlaces(
      raw([
        ["Lisbon Oceanarium", "Lisbon"],
        ["Belém Tower", "Lisbon"],
        ["Time Out Market", "Lisbon"],
      ]),
      caption,
    );
    expect(settled.places.map((place) => place.name)).toEqual([
      "Time Out Market",
    ]);
  });

  it("matches a short name only as a whole word", () => {
    expect(
      settleReelPlaces(
        raw([["Ria Bar"]]),
        "Lunch at @manteigaria, then bar hopping",
      ).places,
    ).toEqual([]);
    expect(
      settleReelPlaces(raw([["Ria Bar"]]), "Drinks at Ria Bar tonight").places,
    ).toHaveLength(1);
  });

  it("needs a short name's words together, not in separate phrases", () => {
    expect(
      settleReelPlaces(raw([["Ria Bar"]]), "Ria café, then a bar").places,
    ).toEqual([]);
    expect(
      settleReelPlaces(raw([["Ria Bar"]]), "Drinks at Ria-Bar tonight").places,
    ).toHaveLength(1);
  });

  it("matches across accents and case", () => {
    const settled = settleReelPlaces(
      raw([["PASTEIS DE BELEM", "Lisbon"]]),
      caption,
    );
    expect(settled.places).toHaveLength(1);
  });

  it("keeps a place the text names only by its handle", () => {
    const settled = settleReelPlaces(raw([["Manteigaria", "Lisbon"]]), caption);
    expect(settled.places).toHaveLength(1);
  });

  it("drops duplicates and blank names", () => {
    const settled = settleReelPlaces(
      raw([
        ["Time Out Market", "Lisbon"],
        ["  time  out market ", "lisbon"],
        ["", "Lisbon"],
      ]),
      caption,
    );
    expect(settled.places).toEqual([
      { name: "Time Out Market", city: "Lisbon" },
    ]);
  });

  it("leaves the city off a place that has none", () => {
    expect(
      settleReelPlaces(raw([["Time Out Market"]]), caption).places,
    ).toEqual([{ name: "Time Out Market" }]);
  });

  it("names the city only when every place shares it", () => {
    const text =
      "Time Out Market and Manteigaria in Lisbon, Le Bernardin in New York";
    expect(
      settleReelPlaces(
        raw([
          ["Time Out Market", "Lisbon"],
          ["Manteigaria", "Lisbon"],
        ]),
        text,
      ).city,
    ).toBe("Lisbon");
    expect(
      settleReelPlaces(
        raw([
          ["Time Out Market", "Lisbon"],
          ["Manteigaria", "Lisbon"],
          ["Le Bernardin", "New York"],
        ]),
        text,
      ).city,
    ).toBeUndefined();
    expect(
      settleReelPlaces(
        raw([["Time Out Market", "Lisbon"], ["Manteigaria"]]),
        text,
      ).city,
    ).toBeUndefined();
  });

  it("drops a city the caption never names but keeps the place", () => {
    const settled = settleReelPlaces(
      raw([["Time Out Market", "Porto"]]),
      "Time Out Market is a must",
    );
    expect(settled.places).toEqual([{ name: "Time Out Market" }]);
    expect(settled.city).toBeUndefined();
  });

  it("caps the list at thirty places", () => {
    const names = Array.from({ length: 40 }, (_, i) => `Cafe Number${i}`);
    const settled = settleReelPlaces(
      raw(names.map((name) => [name])),
      names.join(" "),
    );
    expect(settled.places).toHaveLength(30);
  });
});
