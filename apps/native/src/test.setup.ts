// Testing Library only auto-cleans under vitest `globals: true`. Dynamic
// import so Node and edge-runtime suites never load react-dom.
import { createRequire } from "node:module";
import { afterEach, vi } from "vitest";

// Components load bundled photos with Metro's `require("x.jpg")`, which Node
// would parse as JavaScript. Resolve them to an asset id like Metro does.
const requireExtensions = createRequire(import.meta.url).extensions;
for (const ext of [".jpg", ".jpeg", ".png"]) {
  requireExtensions[ext] = (module) => {
    module.exports = 1;
  };
}

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
