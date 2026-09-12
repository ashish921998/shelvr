// Unmounts the React trees @testing-library renders so a component leaked by
// one test can't satisfy or pollute the next. The library only wires this up
// automatically under vitest `globals: true`, which this suite doesn't use.
// The dynamic import keeps non-DOM environments (plain Node, edge runtime)
// from loading react-dom at all.
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
