import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import {
  SHEET_TRANSITION_MS,
  startOnSeededHome,
  tapTab,
  tapUntilVisible,
  fillField,
} from "./seeded-home.ts";

startOnSeededHome({ reset: "settings" });

test("creates a space", async ({ screen }) => {
  const name = `Pilot ${Date.now()}`;

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

  await expect(screen.getByRole("button", name)).toBeVisible({
    timeout: 30_000,
  });
});
