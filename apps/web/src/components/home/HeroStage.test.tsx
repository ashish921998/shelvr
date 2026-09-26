// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HeroStage from "./HeroStage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class Observer {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("starts messy and files itself on click", () => {
  const container = document.createElement("div");
  document.body.append(container);
  act(() => createRoot(container).render(<HeroStage />));

  const stage = container.querySelector("[data-tidy]")!;
  expect(stage.getAttribute("data-tidy")).toBe("false");

  act(() => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(stage.getAttribute("data-tidy")).toBe("true");
  expect(container.querySelector("button")!.getAttribute("aria-label")).toBe(
    "Make a mess again",
  );

  act(() => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(stage.getAttribute("data-tidy")).toBe("false");
});
