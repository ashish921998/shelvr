// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it } from "vitest";

import ConfirmButton from "./ConfirmButton";

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

it("disables itself while the confirmation runs, so a second tap cannot submit again", async () => {
  let submits = 0;
  let finish = () => {};
  const action = async () => {
    submits += 1;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <form action={action}>
        <ConfirmButton />
      </form>,
    ),
  );
  const button = () => container.querySelector("button") as HTMLButtonElement;
  expect(button().disabled).toBe(false);

  await act(async () => button().click());
  expect(button().disabled).toBe(true);
  expect(button().textContent).toBe("Confirming…");
  await act(async () => button().click());
  expect(submits).toBe(1);

  await act(async () => finish());
  expect(button().disabled).toBe(false);
  act(() => root.unmount());
  container.remove();
});
