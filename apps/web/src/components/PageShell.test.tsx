// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  captureWebAnalyticsEvent: analytics.capture,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/i/abc" }));

import PageShell from "./PageShell";
import SharePageView from "./SharePageView";

describe("PageShell", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    analytics.capture.mockClear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/i/abc");
  });

  it("counts the page view with the campaign the page itself sets", () => {
    const root = createRoot(document.createElement("div"));
    act(() =>
      root.render(
        <PageShell>
          <SharePageView token="abc" outcome="found" />
        </PageShell>,
      ),
    );
    act(() => root.unmount());
    expect(analytics.capture).toHaveBeenCalledWith(
      "$pageview",
      expect.objectContaining({ campaign: "share" }),
    );
  });
});
