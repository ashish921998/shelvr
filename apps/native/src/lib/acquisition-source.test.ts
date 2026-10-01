import { describe, expect, it, vi } from "vitest";
import {
  ACQUISITION_SOURCES,
  orderAcquisitionSources,
  sourceLabel,
} from "./acquisition-source";

vi.mock("@/lib/analytics", () => ({ analytics: { capture: vi.fn() } }));

describe("orderAcquisitionSources", () => {
  it("returns every source once", () => {
    const order = orderAcquisitionSources();
    expect([...order].sort()).toEqual([...ACQUISITION_SOURCES].sort());
  });

  it.each([0, 0.5, 0.999])(
    "keeps friend, store and other last (random %s)",
    (value) => {
      const order = orderAcquisitionSources(() => value);
      expect(order.slice(-3)).toEqual(["friend", "store_search", "other"]);
    },
  );
});

describe("sourceLabel", () => {
  it("names the platform's own store", () => {
    expect(sourceLabel("store_search", "ios")).toEqual({
      kind: "message",
      key: "onboarding.sourceAppStore",
    });
    expect(sourceLabel("store_search", "android")).toEqual({
      kind: "message",
      key: "onboarding.sourceGooglePlay",
    });
  });
});
