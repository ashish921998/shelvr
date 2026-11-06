import { describe, expect, it } from "vitest";

import { creatorMapHref, creatorMapRoute } from "./creator-map-link";

const TOKEN = "0123456789abcdef0123456789abcdef";
const ROUTE = `/creator-map/${TOKEN}?city=Mexico%20City`;

describe("creatorMapRoute", () => {
  it.each([
    `shelvr:///?creatorMap=${TOKEN}&city=Mexico%20City`,
    `shelvr-dev:///?creatorMap=${TOKEN}&city=Mexico%20City`,
    `shelvr-preview:///?creatorMap=${TOKEN}&city=Mexico%20City`,
    `shelvr://?creatorMap=${TOKEN}&city=Mexico%20City`,
    `shelvr:///?city=Mexico+City&creatorMap=${TOKEN}`,
  ])("opens the Save all screen for %s", (link) => {
    expect(creatorMapRoute(link)).toBe(ROUTE);
  });

  it("tidies the city's spaces", () => {
    expect(
      creatorMapRoute(
        `shelvr:///?creatorMap=${TOKEN}&city=%20Mexico%20%20City%20`,
      ),
    ).toBe(ROUTE);
  });

  it("keeps a city up to 80 characters", () => {
    const city = "a".repeat(80);
    expect(creatorMapRoute(`shelvr:///?creatorMap=${TOKEN}&city=${city}`)).toBe(
      `/creator-map/${TOKEN}?city=${city}`,
    );
  });

  it.each([
    ["a web link", `https://shelvr.app/?creatorMap=${TOKEN}&city=Lima`],
    ["another scheme", `myapp:///?creatorMap=${TOKEN}&city=Lima`],
    ["a host", `shelvr://list-invite/x?creatorMap=${TOKEN}&city=Lima`],
    ["a path", `shelvr:///add?creatorMap=${TOKEN}&city=Lima`],
    ["a bad token", "shelvr:///?creatorMap=nothex&city=Lima"],
    [
      "an uppercase token",
      `shelvr:///?creatorMap=${TOKEN.toUpperCase()}&city=Lima`,
    ],
    ["no token", "shelvr:///?city=Lima"],
    ["no city", `shelvr:///?creatorMap=${TOKEN}`],
    ["a blank city", `shelvr:///?creatorMap=${TOKEN}&city=%20%20`],
    [
      "an 81-character city",
      `shelvr:///?creatorMap=${TOKEN}&city=${"a".repeat(81)}`,
    ],
    ["not a link", "/creator-map"],
  ])("ignores %s", (_name, link) => {
    expect(creatorMapRoute(link)).toBeNull();
  });
});

describe("creatorMapHref", () => {
  it("encodes the token and the city", () => {
    expect(creatorMapHref("a/b", "São Paulo & Co")).toBe(
      "/creator-map/a%2Fb?city=S%C3%A3o%20Paulo%20%26%20Co",
    );
  });
});
