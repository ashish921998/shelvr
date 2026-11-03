// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  pathname: "/",
  reportWebVital: (_metric: { name: string; value: number }) => {},
}));
vi.mock("@/lib/analytics", () => ({
  captureWebAnalyticsEvent: mocks.capture,
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next/web-vitals", () => ({
  useReportWebVitals: (fn: typeof mocks.reportWebVital) => {
    mocks.reportWebVital = fn;
  },
}));

import PageViewTracker from "./PageViewTracker";

const events = () => mocks.capture.mock.calls.map(([event]) => event);

describe("PageViewTracker", () => {
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.capture.mockClear();
    mocks.pathname = "/";
    window.history.replaceState({}, "", "/");
    root = createRoot(document.createElement("div"));
    act(() => root.render(<PageViewTracker />));
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("leaves the previous page before it views the next one", () => {
    mocks.pathname = "/i/secret";
    window.history.replaceState({}, "", "/i/secret");
    act(() => root.render(<PageViewTracker />));

    expect(events()).toEqual(["$pageview", "$pageleave", "$pageview"]);
    expect(mocks.capture.mock.calls[1]).toEqual([
      "$pageleave",
      expect.objectContaining({ $pathname: "/" }),
      { pathname: "/" },
    ]);
  });

  it("leaves the page once when the tab closes", () => {
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    act(() => root.unmount());
    root = createRoot(document.createElement("div"));

    expect(events()).toEqual(["$pageview", "$pageleave"]);
  });

  it("reports web vitals", () => {
    mocks.reportWebVital({ name: "INP", value: 96 });
    mocks.reportWebVital({ name: "TTFB", value: 40 });

    expect(mocks.capture).toHaveBeenCalledTimes(2);
    expect(mocks.capture).toHaveBeenLastCalledWith("$web_vitals", {
      $pathname: "/",
      $web_vitals_INP_value: 96,
    });
  });
});
