// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlanSketchbook, { type Choice } from "./PlanSketchbook";

const places = [
  { key: "p0", name: "Bastian", area: "Soho", why: "Seafood" },
  { key: "p1", name: "Masque", why: "Tasting menu" },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(
  choices: Record<string, Choice>,
  onChoose: (key: string, choice: Choice) => void = () => undefined,
) {
  act(() =>
    root.render(
      <PlanSketchbook places={places} choices={choices} onChoose={onChoose} />,
    ),
  );
}

function button(label: string) {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  )!;
}

describe("PlanSketchbook", () => {
  it("gives every place its own spread, caption and buttons", () => {
    render({});
    expect(container.querySelectorAll("section")).toHaveLength(3);
    expect(container.textContent).toContain("Soho");
    expect(container.textContent).toContain("1 / 2");
    expect(button("Yes to Masque")).not.toBeNull();
    expect(button("Not Bastian")).not.toBeNull();
  });

  it("flips to the next spread after a new answer, but not when one is undone", () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const onChoose = vi.fn();
    render({ p1: "pick" }, onChoose);
    Object.defineProperty(
      container.querySelector('[aria-label="Shortlist"]'),
      "clientWidth",
      { value: 300 },
    );

    act(() => button("Yes to Bastian").click());
    expect(onChoose).toHaveBeenCalledWith("p0", "pick");
    expect(scrollTo).toHaveBeenCalledWith({ left: 300 });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "2 of 2: Masque",
    );

    act(() => button("Yes to Masque").click());
    expect(onChoose).toHaveBeenCalledWith("p1", "pick");
    expect(scrollTo).toHaveBeenCalledTimes(1);
    delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
  });

  it("keeps flipping forward while a smooth scroll is still on the old page", () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    render({});
    const track = container.querySelector<HTMLElement>(
      '[aria-label="Shortlist"]',
    )!;
    Object.defineProperty(track, "clientWidth", { value: 300 });
    const scrollAt = (left: number) =>
      act(() => {
        track.scrollLeft = left;
        track.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

    act(() => button("Next page").click());
    scrollAt(100);
    act(() => button("Next page").click());
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 600 });

    scrollAt(600);
    expect(button("Next page").disabled).toBe(true);

    // A wheel that stops the next flip short hands the page back to the scroll.
    act(() => button("Previous page").click());
    act(() => {
      track.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    });
    scrollAt(580);
    expect(button("Next page").disabled).toBe(true);
    delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
  });

  it("rings the chosen answer and lists the yeses on the last page", () => {
    render({ p0: "pick", p1: "pass" });
    expect(button("Yes to Bastian").getAttribute("aria-pressed")).toBe("true");
    expect(button("Yes to Bastian").querySelector("svg")).not.toBeNull();
    expect(button("Yes to Masque").querySelector("svg")).toBeNull();
    const end = container.querySelector('[aria-label="End of the shortlist"]')!;
    expect(end.textContent).toContain("1/2");
    expect(end.textContent).toContain("✓ Bastian");
    expect(end.textContent).not.toContain("Masque");
  });
});
