// Testing Library only auto-cleans under vitest `globals: true`. Dynamic
// import so Node and edge-runtime suites never load react-dom.
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
