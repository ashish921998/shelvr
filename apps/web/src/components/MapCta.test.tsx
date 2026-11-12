// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MapCta from "./MapCta";

type Source = "header" | "hero" | "footer" | "place_tool";

const fetchMock = vi.fn();

function mount(source: Source) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<MapCta source={source} />));
  return container.querySelector("a") as HTMLAnchorElement;
}

describe("MapCta", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("shelvr_web_distinct_id", "browser-123");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "test-token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com/");
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN", "000000");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ["header", "Map my saves"],
    ["hero", "Map my saves"],
    ["footer", "Map my saves"],
    ["place_tool", "Save these to Shelvr"],
  ] as const)("labels the %s button %s, on the App Store", (source, label) => {
    const link = mount(source);
    expect(link.textContent).toBe(label);
    expect(link.getAttribute("aria-label")).toBe(`${label}, on the App Store`);
  });

  it("shows the Apple logo on the header pill only", () => {
    const header = mount("header");
    expect(header.querySelectorAll("svg")).toHaveLength(1);
    expect(header.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    for (const source of ["hero", "footer", "place_tool"] as const) {
      expect(mount(source).querySelector("svg")).toBeNull();
    }
  });

  it("links the hero button to the App Store with its campaign", () => {
    expect(mount("hero").href).toBe(
      "https://apps.apple.com/app/id6798143550?pt=000000&ct=web_hero&mt=8",
    );
  });

  it("reports a hero click with its source and campaign", () => {
    const link = mount("hero");
    link.addEventListener("click", (event) => event.preventDefault());

    act(() => link.click());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://us.i.posthog.com/capture/");
    expect(JSON.parse(String(init.body))).toMatchObject({
      event: "app_store_clicked",
      properties: {
        distinct_id: "browser-123",
        source: "hero",
        campaign: "web_hero",
      },
    });
  });
});
