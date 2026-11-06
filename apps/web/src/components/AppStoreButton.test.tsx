// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppStoreButton from "./AppStoreButton";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv("NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN", "123456");
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/m/0123456789abcdef0123456789abcdef");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState({}, "", "/");
  vi.unstubAllEnvs();
});

function campaignOf(source: "map" | "hero"): string | null {
  act(() =>
    root.render(
      <AppStoreButton
        source={source}
        compact
        shareToken="0123456789abcdef0123456789abcdef"
      />,
    ),
  );
  const href = container.querySelector("a")?.getAttribute("href") ?? "";
  return new URL(href).searchParams.get("ct");
}

describe("AppStoreButton campaign", () => {
  it("tags a map page's Download as the map campaign", () => {
    expect(campaignOf("map")).toBe("map");
  });

  it("tags it map even when the page stored its campaign first", () => {
    window.history.replaceState({}, "", "/m/x?ct=map");
    expect(campaignOf("map")).toBe("map");
    window.history.replaceState({}, "", "/m/x");
    expect(campaignOf("map")).toBe("map");
  });

  it("keeps the campaign a visitor arrived with", () => {
    window.history.replaceState({}, "", "/m/x?ct=tiktok_jane");
    expect(campaignOf("map")).toBe("tiktok_jane");
  });

  it("still tags other buttons with their web_ campaign", () => {
    expect(campaignOf("hero")).toBe("web_hero");
  });
});
