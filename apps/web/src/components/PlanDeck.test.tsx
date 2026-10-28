// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlanDeck, { type Choice } from "./PlanDeck";

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
      <PlanDeck places={places} choices={choices} onChoose={onChoose} />,
    ),
  );
}

function button(label: string) {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  )!;
}

describe("PlanDeck", () => {
  it("gives every place its own card, area and labelled buttons", () => {
    render({});
    expect(container.querySelectorAll("section")).toHaveLength(3);
    expect(container.textContent).toContain("Soho");
    expect(container.textContent).toContain("I’d go");
    expect(button("Yes to Masque")).not.toBeNull();
    expect(button("Not Bastian")).not.toBeNull();
  });

  it("flips to the next card after a new answer, but not when one is undone", () => {
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
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "2 of 2: Masque",
    );
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

  it("marks each card with its answer and lists the yeses on the last card", () => {
    render({ p0: "pick", p1: "pass" });
    expect(button("Yes to Bastian").getAttribute("aria-pressed")).toBe("true");
    expect(button("Yes to Masque").getAttribute("aria-pressed")).toBe("false");
    const card = (label: string) =>
      container.querySelector(`[aria-label="${label}"]`)!.textContent;
    expect(card("1 of 2: Bastian")).toContain("You’d go");
    expect(card("2 of 2: Masque")).toContain("Skipped");
    const end = card("End of the shortlist");
    expect(end).toContain("You’d go to 1 of 2");
    expect(end).toContain("Bastian");
    expect(end).not.toContain("Masque");
  });
});
