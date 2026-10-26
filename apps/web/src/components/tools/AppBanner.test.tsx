// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it } from "vitest";

import AppBanner from "./AppBanner";

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  document.body.innerHTML = "";
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<AppBanner />));
  return container;
}

it("shows a App Store link and stays closed after it is dismissed", () => {
  const first = mount();
  const link = first.querySelector("a") as HTMLAnchorElement;
  expect(link.textContent).toBe("Get");
  expect(link.href).toContain("apps.apple.com");

  act(() => (first.querySelector("button") as HTMLButtonElement).click());
  expect(first.querySelector("a")).toBeNull();

  const second = mount();
  expect(second.querySelector("a")).toBeNull();
});
