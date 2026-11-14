import { curatedCityId, curatedCityPicture } from "@/lib/city-picture";
import { expect, it, vi } from "vitest";

vi.mock("@/components/onboarding/city-pictures", () => ({
  CITY_PICTURES: new Proxy(
    {},
    { get: (_target, id) => ({ view: `view:${String(id)}`, food: 0 }) },
  ),
}));

it("matches a curated city whatever its case, accents or spacing", () => {
  expect(curatedCityId("Paris")).toBe("paris");
  expect(curatedCityId("  new   YORK ")).toBe("new-york");
  expect(curatedCityId("Montréal")).toBe("montreal");
  expect(curatedCityId("San Francisco")).toBe("san-francisco");
});

it("matches the common other names of a curated city", () => {
  expect(curatedCityId("New York City")).toBe("new-york");
  expect(curatedCityId("NYC")).toBe("new-york");
  expect(curatedCityId("Lisboa")).toBe("lisbon");
  expect(curatedCityId("København")).toBe("copenhagen");
});

it("does not stretch a curated photo over a different city", () => {
  expect(curatedCityId("Paris, Texas")).toBeUndefined();
  expect(curatedCityId("Kyoto")).toBeUndefined();
  expect(curatedCityId("York")).toBeUndefined();
  expect(curatedCityId("")).toBeUndefined();
});

it("gives the curated city's view photo", () => {
  expect(curatedCityPicture("Tokyo")).toBe("view:tokyo");
  expect(curatedCityPicture("Mumbai")).toBeUndefined();
});
