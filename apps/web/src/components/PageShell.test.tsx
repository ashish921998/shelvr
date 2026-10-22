// @vitest-environment jsdom
import { render } from "@testing-library/react";
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
    analytics.capture.mockClear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/i/abc");
  });

  it("counts the page view with the campaign the page itself sets", () => {
    render(
      <PageShell>
        <SharePageView token="abc" outcome="found" />
      </PageShell>,
    );
    expect(analytics.capture).toHaveBeenCalledWith(
      "$pageview",
      expect.objectContaining({ campaign: "share" }),
    );
  });
});
