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
    // The fake model suggests the saves that share a word with the space's
    // name (apps/native/convex/model/fakeAi.ts), so "Ramen" picks only the
    // seeded Weeknight Miso Ramen. The number keeps the name unique.
    const name = `Ramen ${Date.now()}`;

    // As in create-space: the form can fail to open on the first tap, and
    // text typed while its sheet rises can miss the field.
    await tapTab(screen, "Spaces");
    const field = screen.getByRole("textbox");
    await tapUntilVisible(screen.getByRole("button", "New space"), field, {
      waitMs: 5000,
      timeout: 60_000,
    });
    await new Promise((resolve) => setTimeout(resolve, SHEET_TRANSITION_MS));
    await fillField(field, name);
    await screen.getByLabel("Create space").tap();

    // The recommendation pass runs after the space exists, and the space's
    // header counts what it suggested.
    await screen.getByRole("button", name).tap({ timeout: 30_000 });
    await expect(screen.getByText("1 suggestion")).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      screen.getByRole("button", /^Weeknight Miso Ramen/),
    ).toHaveCount(1, { timeout: 30_000 });
  },
);
