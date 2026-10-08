// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PMF_SURVEY_ID, usePmfSurvey } from "./pmf-survey";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}));

const mock = vi.hoisted(() => ({
  segments: ["(app)", "(tabs)", "(home)"],
  analyticsAvailable: true,
  capture: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useSegments: () => mock.segments,
  useFocusEffect: () => undefined,
}));
vi.mock("@/lib/posthog", () => ({
  isAnalyticsAvailable: () => mock.analyticsAvailable,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: vi.fn() },
}));
vi.mock("@/lib/feedback", () => ({
  isHomeRootRoute: (segments: string[]) => segments[2] === "(home)",
  countEligibleSaves: (items: { status: string }[]) =>
    items.filter((item) => item.status === "ready").length,
}));

const ready = (count: number) =>
  Array.from({ length: count }, () => ({ status: "ready" as const }));

beforeEach(() => {
  storage.clear();
  mock.capture.mockClear();
  mock.segments = ["(app)", "(tabs)", "(home)"];
  mock.analyticsAvailable = true;
});

describe("usePmfSurvey", () => {
  it("waits for two ready saves", () => {
    const one = renderHook(() => usePmfSurvey("user-1", ready(1)));
    expect(one.result.current.visible).toBe(false);
    const two = renderHook(() => usePmfSurvey("user-1", ready(2)));
    expect(two.result.current.visible).toBe(true);
    expect(mock.capture).toHaveBeenCalledWith("survey shown", {
      $survey_id: PMF_SURVEY_ID,
    });
  });

  it("stays hidden while deferred, off Home, or without analytics", () => {
    expect(
      renderHook(() => usePmfSurvey("user-1", ready(3), { defer: true })).result
        .current.visible,
    ).toBe(false);
    mock.segments = ["(app)", "item", "[id]"];
    expect(
      renderHook(() => usePmfSurvey("user-1", ready(3))).result.current.visible,
    ).toBe(false);
    mock.segments = ["(app)", "(tabs)", "(home)"];
    mock.analyticsAvailable = false;
    expect(
      renderHook(() => usePmfSurvey("user-1", ready(3))).result.current.visible,
    ).toBe(false);
    expect(mock.capture).not.toHaveBeenCalled();
  });

  it("records the English answer in PostHog's survey shape, once", () => {
    const { result } = renderHook(() => usePmfSurvey("user-1", ready(3)));
    act(() => result.current.answer("very"));
    expect(mock.capture).toHaveBeenCalledWith(
      "survey sent",
      expect.objectContaining({
        $survey_id: PMF_SURVEY_ID,
        $survey_completed: true,
        "$survey_response_b23b3172-892d-48cc-bccb-a7b9fd6a68ed":
          "Very disappointed",
        $set: { [`$survey_responded/${PMF_SURVEY_ID}`]: true },
      }),
    );
    expect(result.current.visible).toBe(false);
    // A later visit on this device does not ask again.
    expect(
      renderHook(() => usePmfSurvey("user-1", ready(3))).result.current.visible,
    ).toBe(false);
  });

  it("does not ask again after not now, per account", () => {
    const { result } = renderHook(() => usePmfSurvey("user-1", ready(3)));
    act(() => result.current.dismiss());
    expect(mock.capture).toHaveBeenCalledWith(
      "survey dismissed",
      expect.objectContaining({ $survey_id: PMF_SURVEY_ID }),
    );
    expect(result.current.visible).toBe(false);
    expect(
      renderHook(() => usePmfSurvey("user-2", ready(3))).result.current.visible,
    ).toBe(true);
  });
});
