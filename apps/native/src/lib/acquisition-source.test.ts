import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACQUISITION_SOURCES,
  acquisitionSourceAnalytics,
  orderAcquisitionSources,
  sourceLabel,
} from "./acquisition-source";

const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: analyticsMock }));

describe("acquisitionSourceAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits answered with the source, its position and a set-once person property", () => {
    acquisitionSourceAnalytics.answered("reddit", 2);

    expect(analyticsMock.capture).toHaveBeenCalledWith(
      "acquisition_source_answered",
      {
        source: "reddit",
        position: 2,
        $set_once: { acquisition_source: "reddit" },
      },
    );
  });

  it("emits skipped with no properties", () => {
    acquisitionSourceAnalytics.skipped();

    expect(analyticsMock.capture).toHaveBeenCalledWith(
      "acquisition_source_skipped",
    );
  });

  // The ids are an analytics contract: PostHog groups the event and the
  // person property on them. The literal list catches a rename.
  it("pins the source ids", () => {
    expect(ACQUISITION_SOURCES).toEqual([
      "tiktok",
      "instagram",
      "youtube",
      "x",
      "reddit",
      "ai_assistant",
      "friend",
      "shared_link",
      "store_search",
      "other",
    ]);
  });
});

describe("orderAcquisitionSources", () => {
  it("returns every source once", () => {
    const order = orderAcquisitionSources();
    expect([...order].sort()).toEqual([...ACQUISITION_SOURCES].sort());
  });

  it.each([0, 0.5, 0.999])(
    "keeps friend, shared link, store and other last (random %s)",
    (value) => {
      const order = orderAcquisitionSources(() => value);
      expect(order.slice(-4)).toEqual([
        "friend",
        "shared_link",
        "store_search",
        "other",
      ]);
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
