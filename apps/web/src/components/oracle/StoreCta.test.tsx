// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ captureWebAnalyticsEvent: vi.fn() }));

import StoreCta from "./StoreCta";

function render(userAgent: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<StoreCta note="7-day trial on the annual plan." />));
  return { container, unmount: () => act(() => root.unmount()) };
}

describe("StoreCta", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => vi.restoreAllMocks());

  it("offers the App Store and its trial note on an iPhone", () => {
    const { container, unmount } = render(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    );
    expect(container.textContent).toContain("Get Shelvr on the App Store");
    expect(container.textContent).toContain("7-day trial");
    expect(container.querySelector("input[type=email]")).toBeNull();
    unmount();
  });

  it("offers the Android waitlist instead of an App Store link on Android", () => {
    const { container, unmount } = render(
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/130.0 Mobile",
    );
    expect(container.textContent).not.toContain("App Store");
    expect(container.textContent).not.toContain("7-day trial");
    expect(container.textContent).toContain("On Android?");
    unmount();
  });
});
