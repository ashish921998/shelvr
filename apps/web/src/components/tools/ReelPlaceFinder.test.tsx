// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  captureWebAnalyticsEvent: analytics.capture,
}));

import ReelPlaceFinder from "./ReelPlaceFinder";

const CAPTION =
  "This sketch follows the list’s order. Shelvr looks each place up and pins it on a real map.";

const fetchMock = vi.fn();
const roots: Root[] = [];

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<ReelPlaceFinder />));
  return container;
}

function reply(status: number, body?: unknown) {
  fetchMock.mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function submitLink(container: HTMLElement) {
  const input = container.querySelector("#reel-link") as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setValue?.call(input, "https://www.instagram.com/reel/abc123/");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    (container.querySelector("form") as HTMLFormElement).requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function trySample(container: HTMLElement) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === "Try a sample",
  ) as HTMLButtonElement;
  act(() => button.click());
}

function results(container: HTMLElement) {
  return container.querySelector("[aria-live]") as HTMLElement;
}

function paragraph(container: HTMLElement, start: string) {
  return Array.from(results(container).querySelectorAll("p")).find(
    (candidate) => candidate.textContent?.startsWith(start),
  );
}

function sketchNumbers(figure: Element) {
  return Array.from(figure.querySelectorAll("svg g")).map(
    (pin) => pin.querySelector("text")?.textContent,
  );
}

describe("ReelPlaceFinder results", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    window.sessionStorage.clear();
    analytics.capture.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    vi.unstubAllGlobals();
  });

  it("puts the sketch under the sample's list, then the save card", () => {
    const container = mount();
    trySample(container);

    const section = results(container);
    const heading = section.querySelector("h2") as HTMLHeadingElement;
    const list = section.querySelector("ol") as HTMLOListElement;
    const figure = section.querySelector("figure") as HTMLElement;
    expect(heading.textContent).toBe("5 places in Lisbon");
    expect(heading.nextElementSibling).toBe(list);
    expect(list.nextElementSibling).toBe(figure);

    expect(figure.getAttribute("aria-hidden")).toBe("true");
    expect(sketchNumbers(figure)).toEqual(["1", "2", "3", "4", "5"]);
    expect(figure.querySelector("figcaption")?.textContent).toBe(CAPTION);

    expect(paragraph(container, "Put these")?.textContent).toBe(
      "Put these on your Lisbon map.",
    );
    const body = paragraph(container, "Get Shelvr")?.textContent ?? "";
    expect(body).toContain("share a reel to it");
    expect(body).not.toContain("this reel");
    expect(
      section.querySelector("a[aria-label]")?.getAttribute("aria-label"),
    ).toBe("Save these to Shelvr, on the App Store");
  });

  it("sketches ten of thirteen places and counts the rest", async () => {
    reply(200, {
      places: Array.from({ length: 13 }, (_, i) => ({
        name: `Place ${i + 1}`,
      })),
    });
    const container = mount();
    await submitLink(container);

    const section = results(container);
    const figure = section.querySelector("figure") as HTMLElement;
    expect(sketchNumbers(figure)).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 1)),
    );
    expect(figure.querySelector("svg")?.textContent).toContain(
      "+3 more in the list",
    );
    expect(paragraph(container, "Put these")?.textContent).toBe(
      "Put these on your map.",
    );
    expect(paragraph(container, "Get Shelvr")?.textContent).toContain(
      "share this reel to it",
    );
    expect(section.querySelectorAll("ol > li")).toHaveLength(13);
  });

  it("shows no sketch and no card when the reel names no place", async () => {
    reply(200, { places: [] });
    const container = mount();
    await submitLink(container);

    const section = results(container);
    expect(section.textContent).toContain("No places found");
    expect(section.querySelector("figure")).toBeNull();
    expect(section.textContent).not.toContain("Save these to Shelvr");
  });

  it("shows no sketch when the finder is busy", async () => {
    reply(429);
    const container = mount();
    await submitLink(container);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Lots of people are using this right now. Try again soon.",
    );
    expect(container.querySelector("figure")).toBeNull();
  });

  it("reports a click on the save button as a place tool click", () => {
    const container = mount();
    trySample(container);
    const link = results(container).querySelector(
      "a[aria-label]",
    ) as HTMLAnchorElement;
    link.addEventListener("click", (event) => event.preventDefault());

    act(() => link.click());

    expect(analytics.capture).toHaveBeenCalledWith(
      "app_store_clicked",
      expect.objectContaining({ source: "place_tool" }),
    );
  });
});
