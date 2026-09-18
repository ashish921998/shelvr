import { expect, it } from "vitest";
import { pluralRules } from "./localization";
import { digestCopy } from "./notificationFields";

it.each([
  ["en", 0, "other"],
  ["en", 1, "one"],
  ["en", 1.5, "other"],
  ["fr", 0, "one"],
  ["fr", 1, "one"],
  ["fr", 2, "other"],
  ["fr", 1000000, "many"],
  ["pt-BR", 0, "one"],
  ["pt-BR", 1, "one"],
  ["pt-BR", 2, "other"],
  ["es", 0, "other"],
  ["es-MX", 1, "one"],
  ["es", 1000000, "many"],
  ["ja", 1, "other"],
  ["ko", 1, "other"],
  ["de", 1, "one"],
] as const)("%s selects %s as %s", (locale, count, category) => {
  expect(pluralRules[locale](count)).toBe(category);
});

it("uses natural singular and plural English in newly registered notifications", () => {
  expect(digestCopy("en", 1).body).toBe("1 save waiting for you");
  expect(digestCopy("en", 2).body).toBe("2 saves waiting for you");
  expect(digestCopy(undefined, 1).body).toBe(
    "1 saved things are waiting on your weekly shelf.",
  );
});
