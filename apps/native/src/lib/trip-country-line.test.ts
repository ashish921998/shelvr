import { expect, it, vi } from "vitest";
import { tripCountryLine } from "./trip-planner";

vi.mock("expo-localization", () => ({
  getLocales: () => [
    { languageTag: "fr-FR", languageCode: "fr", textDirection: "ltr" },
  ],
  useLocales: () => [
    { languageTag: "fr-FR", languageCode: "fr", textDirection: "ltr" },
  ],
  getCalendars: () => [{ timeZone: "UTC" }],
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

it("names a trip's countries in the app's language, as the picker does", () => {
  expect(tripCountryLine(["DE", "JP"])).toBe("Allemagne · Japon");
});
