import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  SHEET_TRANSITION_MS,
  startOnSeededHome,
  tapTab,
  tapUntilVisible,
  fillField,
} from "./seeded-home.ts";

startOnSeededHome();

test(
  "suggests a seeded save for a new space",
  {
    skip:
      process.env.E2E_FAKE_AI !== "local-v1" &&
      "needs the e2e job's local backend, which runs the fake model",
  },
  async ({ screen }) => {
    const name = `Ramen ${Date.now()}`;

    const newSpace = screen.getByRole("button", "New space");
    await tapTab(screen, "Spaces", newSpace);
    const field = screen.getByRole("textbox");
    await tapUntilVisible(newSpace, field, {
      waitMs: 5000,
      timeout: 60_000,
    });
    await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
    await fillField(field, name);
    await screen.getByLabel("Create space").tap();
    await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));

    await tapUntilVisible(
      screen.getByRole("button", name),
      screen.getByText("1 suggestion"),
      { waitMs: 10_000, timeout: 90_000 },
    );
    await expect(
      screen.getByRole("button", /^Weeknight Miso Ramen/),
    ).toHaveCount(1, { timeout: 30_000 });
  },
);
