// Testing Library only auto-cleans under vitest `globals: true`. Dynamic
// import so Node and edge-runtime suites never load react-dom.
import { afterEach, vi } from "vitest";

vi.mock("expo-localization", () => ({
  getLocales: () => [
    { languageTag: "en-US", languageCode: "en", textDirection: "ltr" },
  ],
  useLocales: () => [
    { languageTag: "en-US", languageCode: "en", textDirection: "ltr" },
  ],
  getCalendars: () => [{ timeZone: "UTC" }],
}));

afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
