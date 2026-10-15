// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import Faq from "./Faq";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

it("keeps one answer open at a time", () => {
  const container = document.createElement("div");
  document.body.append(container);
  act(() => createRoot(container).render(<Faq />));

  const buttons = [...container.querySelectorAll("button")];
  const expanded = () => buttons.map((b) => b.getAttribute("aria-expanded"));
  expect(expanded()).toEqual(["true", "false", "false", "false", "false"]);

  act(() => buttons[2].click());
  expect(expanded()).toEqual(["false", "false", "true", "false", "false"]);

  act(() => buttons[2].click());
  expect(expanded()).toEqual(["false", "false", "false", "false", "false"]);
});
